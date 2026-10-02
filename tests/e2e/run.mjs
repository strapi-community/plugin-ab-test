// End-to-end checks against a running playground (see README, "Developing").
// Usage: AB_TEST_URL=http://localhost:1447 node tests/e2e/run.mjs
import assert from 'node:assert/strict';

const BASE = process.env.AB_TEST_URL ?? 'http://localhost:1447';
const ADMIN = { email: 'ab-test@example.com', password: 'Password123!' };
const ARTICLE = 'api::article.article';
const PAGE = 'api::page.page';

let token;
let failures = 0;

const request = async (method, path, { body, auth = false, headers = {} } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(auth ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  return { status: response.status, json, text, headers: response.headers };
};

const admin = async (method, path, body) => {
  const result = await request(method, path, { body, auth: true });

  if (result.status >= 400) {
    throw new Error(`${method} ${path} → ${result.status} ${result.text}`);
  }

  return result.json;
};

const api = (path) => request('GET', path);

const gql = async (query) => (await request('POST', '/graphql', { body: { query } })).json;

/**
 * Number of database queries a public request causes, as reported by the playground's test
 * middleware. The lowest of a few runs, so a background cache refresh cannot skew it.
 */
const countQueries = async (path) => {
  const runs = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await request('GET', path, { headers: { 'x-count-queries': '1' } });
    runs.push(Number(result.headers.get('x-query-count')));
  }

  return Math.min(...runs);
};

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split('\n').join('\n        ')}`);
  }
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/_health`);
      if (response.status === 204) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Strapi is not reachable at ${BASE}`);
};

const authenticate = async () => {
  const init = await request('GET', '/admin/init');

  const result = init.json?.data?.hasAdmin
    ? await request('POST', '/admin/login', { body: ADMIN })
    : await request('POST', '/admin/register-admin', {
        body: { ...ADMIN, firstname: 'AB', lastname: 'Test' },
      });

  token = result.json?.data?.token ?? result.json?.data?.accessToken;
  assert.ok(token, `Could not authenticate as admin: ${result.status} ${result.text}`);
};

const cm = (uid) => `/content-manager/collection-types/${uid}`;

const createEntry = async (uid, data, locale) => {
  const result = await admin('POST', `${cm(uid)}${locale ? `?locale=${locale}` : ''}`, data);
  return result.data.documentId;
};

const saveLocale = (uid, documentId, data, locale) =>
  admin('PUT', `${cm(uid)}/${documentId}?locale=${locale}`, data);

const publish = (uid, documentId, locale) =>
  admin('POST', `${cm(uid)}/${documentId}/actions/publish${locale ? `?locale=${locale}` : ''}`, {});

const listCm = async (uid) => (await admin('GET', `${cm(uid)}?pageSize=100&locale=en`)).results;

/**
 * The suite deletes every entry and experiment it finds. It only runs against a playground
 * started on the scratch database (`DATABASE_FILENAME=.tmp/e2e.db`), unless told otherwise.
 */
const assertScratchDatabase = async () => {
  const database = (await request('GET', '/_health')).headers.get('x-playground-db');

  if (database !== 'e2e.db' && process.env.AB_TEST_ALLOW_WIPE !== '1') {
    throw new Error(
      `Refusing to run: the playground uses "${database || 'an unknown database'}", not e2e.db. ` +
        'Start it with DATABASE_FILENAME=.tmp/e2e.db, or set AB_TEST_ALLOW_WIPE=1 to wipe that database.'
    );
  }
};

const reset = async () => {
  await assertScratchDatabase();
  await admin('POST', '/ab-test/uninstall/prepare', { variants: 'delete' });

  for (const uid of [ARTICLE, PAGE]) {
    const entries = await listCm(uid);
    for (const entry of entries) {
      await admin('DELETE', `${cm(uid)}/${entry.documentId}?locale=*`);
    }
  }
};

const seeds = Array.from({ length: 200 }, (_, index) => `visitor-${index}`);

const main = async () => {
  await waitForServer();
  await authenticate();
  await reset();

  console.log('\nSettings');

  await check('content types can be enabled', async () => {
    const before = await admin('GET', '/ab-test/settings');
    assert.deepEqual(before.data.contentTypes, []);
    assert.ok(before.contentTypes.some((type) => type.uid === ARTICLE && type.localized));

    const after = await admin('PUT', '/ab-test/settings', { contentTypes: [ARTICLE, PAGE] });
    assert.deepEqual(after.data.contentTypes, [ARTICLE, PAGE]);
  });

  await check('the admin panel can list where A/B testing is enabled', async () => {
    const { data } = await admin('GET', '/ab-test/content-types');
    assert.equal(data.find((type) => type.uid === ARTICLE).enabled, true);
    assert.equal(data.find((type) => type.uid === PAGE).localized, false);

    // What the frontend prompt builds routes and query names from.
    const article = data.find((type) => type.uid === ARTICLE);
    assert.equal(article.pluralName, 'articles');
    assert.equal(article.singularName, 'article');
  });

  await check('plugin content types cannot be enabled', async () => {
    const result = await request('PUT', '/ab-test/settings', {
      auth: true,
      body: { contentTypes: ['plugin::users-permissions.user'] },
    });
    assert.equal(result.status, 400);
  });

  console.log('\nLocalized content type with Draft & Publish');

  const control = await createEntry(
    ARTICLE,
    { title: 'Original title', slug: 'my-post', body: 'Original body' },
    'en'
  );
  await saveLocale(ARTICLE, control, { title: 'Titre original', slug: 'mon-article' }, 'fr');
  await publish(ARTICLE, control, 'en');
  await publish(ARTICLE, control, 'fr');

  const other = await createEntry(ARTICLE, { title: 'Untested', slug: 'untested' }, 'en');
  await publish(ARTICLE, other, 'en');

  // What these requests cost before any experiment exists.
  const baseline = {
    one: await countQueries(`/api/articles/${control}`),
    list: await countQueries('/api/articles'),
    pages: await countQueries('/api/pages'),
  };

  let experiment;
  let variant;

  await check('creating an experiment clones every locale into a draft variant', async () => {
    experiment = (
      await admin('POST', '/ab-test/experiments', {
        contentType: ARTICLE,
        controlDocumentId: control,
        name: 'Headline test',
      })
    ).data;

    assert.equal(experiment.status, 'draft');
    assert.equal(experiment.variants.length, 1);
    assert.equal(experiment.variants[0].key, 'b');
    assert.equal(experiment.variants[0].weight, 50);

    variant = experiment.variants[0].documentId;
    assert.notEqual(variant, control);

    const en = (await admin('GET', `${cm(ARTICLE)}/${variant}?locale=en`)).data;
    const fr = (await admin('GET', `${cm(ARTICLE)}/${variant}?locale=fr`)).data;
    assert.equal(en.title, 'Original title');
    assert.equal(fr.title, 'Titre original');
    assert.notEqual(en.slug, 'my-post');
    assert.equal(en.publishedAt, null);
  });

  await check(
    'another variant cannot be added while one is identical to the original',
    async () => {
      const unchanged = await admin(
        'GET',
        `/ab-test/experiments/${experiment.documentId}/unchanged-variants`
      );
      assert.deepEqual(unchanged.data, ['b']);

      const result = await request(
        'POST',
        `/ab-test/experiments/${experiment.documentId}/variants`,
        {
          auth: true,
        }
      );
      assert.equal(result.status, 400);
      assert.match(result.text, /identical to the original/);

      // Nothing was created by the refused request.
      const current = (await admin('GET', `/ab-test/experiments/${experiment.documentId}`)).data;
      assert.equal(current.variants.length, 1);
    }
  );

  await check(
    'an experiment cannot start while its variant is identical to the original',
    async () => {
      const result = await request(
        'POST',
        `/ab-test/experiments/${experiment.documentId}/actions/start`,
        { auth: true }
      );
      assert.equal(result.status, 400);
      assert.match(result.text, /identical to the original/);
    }
  );

  await check('variants are hidden from relation pickers', async () => {
    const { results } = await admin(
      'GET',
      `/content-manager/relations/${ARTICLE}/related?locale=en&pageSize=100`
    );
    const ids = results.map((entry) => entry.documentId);
    assert.ok(ids.includes(control));
    assert.ok(!ids.includes(variant));
  });

  await check('a document cannot be in two experiments', async () => {
    const asControl = await request('POST', '/ab-test/experiments', {
      auth: true,
      body: { contentType: ARTICLE, controlDocumentId: control },
    });
    const asVariant = await request('POST', '/ab-test/experiments', {
      auth: true,
      body: { contentType: ARTICLE, controlDocumentId: variant },
    });
    assert.equal(asControl.status, 400);
    assert.equal(asVariant.status, 400);
  });

  await check('the edit view can tell controls and variants apart', async () => {
    const onControl = await admin(
      'GET',
      `/ab-test/experiments/lookup?contentType=${ARTICLE}&documentId=${control}`
    );
    const onVariant = await admin(
      'GET',
      `/ab-test/experiments/lookup?contentType=${ARTICLE}&documentId=${variant}`
    );
    const onOther = await admin(
      'GET',
      `/ab-test/experiments/lookup?contentType=${ARTICLE}&documentId=${other}`
    );

    assert.equal(onControl.data.role, 'control');
    assert.equal(onVariant.data.role, 'variant');
    assert.equal(onVariant.data.variantKey, 'b');
    assert.equal(onOther.data, null);
    assert.equal(onOther.enabled, true);

    const many = await admin('POST', '/ab-test/experiments/lookup-many', {
      contentType: ARTICLE,
      documentIds: [control, other],
    });
    assert.deepEqual(Object.keys(many.data), [control]);
  });

  // Variant B only exists in English: French visitors must keep getting the original.
  await saveLocale(ARTICLE, variant, { title: 'Variant title', body: 'Variant body' }, 'en');

  await check('an experiment cannot start before a variant is published', async () => {
    const result = await request(
      'POST',
      `/ab-test/experiments/${experiment.documentId}/actions/start`,
      { auth: true }
    );
    assert.equal(result.status, 400);
    assert.match(result.text, /Publish at least one variant/);
  });

  await publish(ARTICLE, variant, 'en');

  await check('an edited variant no longer blocks adding another one', async () => {
    const unchanged = await admin(
      'GET',
      `/ab-test/experiments/${experiment.documentId}/unchanged-variants`
    );
    assert.deepEqual(unchanged.data, []);
  });

  await check('a draft experiment changes nothing for visitors', async () => {
    const result = await api(`/api/articles/${control}?abSeed=visitor-1`);
    assert.equal(result.json.data.title, 'Original title');
    assert.equal(result.json.data.abTest, undefined);
  });

  await check(
    'variants are hidden from the public API even before the experiment starts',
    async () => {
      const list = await api('/api/articles?pagination[pageSize]=100');
      const ids = list.json.data.map((entry) => entry.documentId);
      assert.deepEqual(ids.sort(), [control, other].sort());
      assert.equal(list.json.meta.pagination.total, 2);

      const direct = await api(`/api/articles/${variant}`);
      assert.equal(direct.status, 404);
    }
  );

  await check('variants are hidden from the Content Manager list but can be opened', async () => {
    const ids = (await listCm(ARTICLE)).map((entry) => entry.documentId);
    assert.ok(!ids.includes(variant));
    assert.ok(ids.includes(control));

    const opened = await admin('GET', `${cm(ARTICLE)}/${variant}?locale=en`);
    assert.equal(opened.data.title, 'Variant title');
  });

  await check('a success metric can be set, changed and cleared', async () => {
    const path = `/ab-test/experiments/${experiment.documentId}`;

    const conversion = (
      await admin('PUT', path, { goal: { type: 'conversion', event: ' form_submitted ' } })
    ).data;
    assert.deepEqual(conversion.goal, { type: 'conversion', event: 'form_submitted' });

    for (const goal of [{ type: 'conversion' }, { type: 'revenue' }, 'pageviews']) {
      const invalid = await request('PUT', path, { auth: true, body: { goal } });
      assert.equal(invalid.status, 400);
    }

    // An update that does not mention the metric leaves it alone.
    const untouched = (await admin('PUT', path, { hypothesis: 'A sharper headline' })).data;
    assert.deepEqual(untouched.goal, conversion.goal);

    const pageviews = (await admin('PUT', path, { goal: { type: 'pageviews' } })).data;
    assert.deepEqual(pageviews.goal, { type: 'pageviews', event: null });

    const cleared = (await admin('PUT', path, { goal: null })).data;
    assert.equal(cleared.goal, null);
  });

  await check('results are optional and follow the PostHog connection', async () => {
    const { posthog } = await admin('GET', '/ab-test/settings');
    assert.equal(typeof posthog.connected, 'boolean');
    assert.equal(posthog.connected, posthog.source !== null);

    // A key that cannot run queries is named and refused before PostHog is asked anything.
    if (posthog.source !== 'config') {
      for (const personalApiKey of ['phc_project_token', 'phs_project_secret']) {
        const refused = await request('PUT', '/ab-test/posthog', {
          auth: true,
          body: { host: 'https://us.posthog.com', projectId: '1', personalApiKey },
        });
        assert.equal(refused.status, 400);
        assert.match(refused.text, /personal API key \(phx_…\)/);
      }
    }

    // Not started yet: nothing is asked from PostHog, connected or not.
    const results = (await admin('GET', `/ab-test/experiments/${experiment.documentId}/results`))
      .data;
    assert.equal(results.connected, posthog.connected);
    assert.deepEqual(results.versions, []);
    assert.equal(results.error, null);
  });

  await check('an experiment can be scheduled, scoped and started', async () => {
    const updated = (
      await admin('PUT', `/ab-test/experiments/${experiment.documentId}`, {
        weights: { b: 50 },
        hypothesis: 'A sharper headline gets more clicks',
      })
    ).data;
    assert.equal(updated.variants[0].weight, 50);

    const invalid = await request('PUT', `/ab-test/experiments/${experiment.documentId}`, {
      auth: true,
      body: { weights: { b: 150 } },
    });
    assert.equal(invalid.status, 400);

    const started = (
      await admin('POST', `/ab-test/experiments/${experiment.documentId}/actions/start`)
    ).data;
    assert.equal(started.status, 'running');
  });

  await check('a seed splits visitors and keeps the original identity', async () => {
    let served = 0;

    for (const seed of seeds) {
      const { json } = await api(`/api/articles/${control}?abSeed=${seed}`);
      const entry = json.data;

      assert.equal(entry.documentId, control);
      assert.equal(entry.slug, 'my-post');
      assert.equal(entry.abTest.experiment, experiment.key);

      if (entry.abTest.variant === 'b') {
        served += 1;
        assert.equal(entry.title, 'Variant title');
      } else {
        assert.equal(entry.abTest.variant, 'control');
        assert.equal(entry.title, 'Original title');
      }
    }

    assert.ok(served > 70 && served < 130, `expected about half of 200, got ${served}`);
  });

  await check('the same seed always gets the same version', async () => {
    const first = await api(`/api/articles/${control}?abSeed=sticky`);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const again = await api(`/api/articles/${control}?abSeed=sticky`);
      assert.equal(again.json.data.abTest.variant, first.json.data.abTest.variant);
    }
  });

  await check('without a seed the original is served untouched', async () => {
    const { json } = await api(`/api/articles/${control}`);
    assert.equal(json.data.title, 'Original title');
    assert.equal(json.data.abTest, undefined);
  });

  await check('abVariant forces a version', async () => {
    const b = await api(`/api/articles/${control}?abVariant=b`);
    const original = await api(`/api/articles/${control}?abVariant=control`);
    assert.equal(b.json.data.title, 'Variant title');
    assert.equal(original.json.data.title, 'Original title');
    assert.equal(original.json.data.abTest.variant, 'control');
  });

  await check('the plugin adds no query unless a variant is served', async () => {
    assert.ok(baseline.one > 0, 'the playground must report query counts');

    // A running experiment, but nothing to swap: same queries as before the plugin was used.
    assert.equal(await countQueries(`/api/articles/${control}`), baseline.one);
    assert.equal(await countQueries('/api/articles'), baseline.list);
    assert.equal(await countQueries('/api/pages'), baseline.pages);
    assert.equal(await countQueries(`/api/articles/${control}?abVariant=control`), baseline.one);

    // Serving a variant costs exactly one more query, for one entry or for a whole list.
    assert.equal(await countQueries(`/api/articles/${control}?abVariant=b`), baseline.one + 1);
    assert.equal(await countQueries('/api/articles?abVariant=b'), baseline.list + 1);
  });

  await check('GraphQL serves variants with the same arguments', async () => {
    const forced = await gql(
      `{ article(documentId: "${control}", abVariant: "b") { documentId title slug abTest { experiment variant } } }`
    );
    assert.equal(forced.data.article.title, 'Variant title');
    assert.equal(forced.data.article.slug, 'my-post');
    assert.equal(forced.data.article.documentId, control);
    assert.deepEqual(forced.data.article.abTest, { experiment: experiment.key, variant: 'b' });

    const plain = await gql(`{ article(documentId: "${control}") { title abTest { variant } } }`);
    assert.equal(plain.data.article.title, 'Original title');
    assert.equal(plain.data.article.abTest, null);

    const list = await gql(
      `{ articles_connection(abVariant: "b") { nodes { documentId title } pageInfo { total } } }`
    );
    assert.equal(list.data.articles_connection.pageInfo.total, 2);
    assert.ok(!list.data.articles_connection.nodes.some((node) => node.documentId === variant));
    assert.ok(list.data.articles_connection.nodes.some((node) => node.title === 'Variant title'));

    const hidden = await gql(`{ article(documentId: "${variant}") { documentId } }`);
    assert.equal(hidden.data.article, null);
  });

  await check('a locale without the variant falls back to the original', async () => {
    const { json } = await api(`/api/articles/${control}?locale=fr&abVariant=b`);
    assert.equal(json.data.title, 'Titre original');
    assert.equal(json.data.slug, 'mon-article');
    assert.deepEqual(json.data.abTest, {
      experiment: experiment.key,
      variant: 'control',
      fallback: true,
    });
  });

  await check('lists swap tested entries in place and keep totals', async () => {
    const { json } = await api(
      '/api/articles?abVariant=b&sort=title&pagination[pageSize]=100&fields[0]=title'
    );
    assert.equal(json.meta.pagination.total, 2);

    const tested = json.data.find((entry) => entry.documentId === control);
    const untested = json.data.find((entry) => entry.documentId === other);
    assert.equal(tested.title, 'Variant title');
    assert.equal(tested.abTest.variant, 'b');
    assert.equal(untested.title, 'Untested');
    assert.equal(untested.abTest, undefined);
  });

  await check('filters match on the original and still serve the variant', async () => {
    const { json } = await api('/api/articles?filters[slug][$eq]=my-post&abVariant=b');
    assert.equal(json.data.length, 1);
    assert.equal(json.data[0].title, 'Variant title');
    assert.equal(json.data[0].slug, 'my-post');
  });

  await check('a locale scope limits where the experiment runs', async () => {
    await admin('POST', `/ab-test/experiments/${experiment.documentId}/actions/pause`);
    await admin('PUT', `/ab-test/experiments/${experiment.documentId}`, { locales: ['fr'] });
    await admin('POST', `/ab-test/experiments/${experiment.documentId}/actions/start`);

    const en = await api(`/api/articles/${control}?abVariant=b`);
    assert.equal(en.json.data.title, 'Original title');
    assert.equal(en.json.data.abTest, undefined);

    await admin('PUT', `/ab-test/experiments/${experiment.documentId}`, { locales: null });
    const back = await api(`/api/articles/${control}?abVariant=b`);
    assert.equal(back.json.data.title, 'Variant title');
  });

  await check('a schedule limits when the experiment runs', async () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    await admin('PUT', `/ab-test/experiments/${experiment.documentId}`, { startAt: future });

    const before = await api(`/api/articles/${control}?abVariant=b`);
    assert.equal(before.json.data.title, 'Original title');

    await admin('PUT', `/ab-test/experiments/${experiment.documentId}`, { startAt: null });
    const after = await api(`/api/articles/${control}?abVariant=b`);
    assert.equal(after.json.data.title, 'Variant title');
  });

  await check('a paused experiment serves the original', async () => {
    await admin('POST', `/ab-test/experiments/${experiment.documentId}/actions/pause`);
    const { json } = await api(`/api/articles/${control}?abVariant=b`);
    assert.equal(json.data.title, 'Original title');
    assert.equal(json.data.abTest, undefined);
  });

  await check('a second variant can be added while paused, and removed', async () => {
    const added = (await admin('POST', `/ab-test/experiments/${experiment.documentId}/variants`))
      .data;
    assert.deepEqual(
      added.variants.map((item) => item.key),
      ['b', 'c']
    );
    assert.equal(added.variants[1].weight, 0);

    const removed = (
      await admin(
        'DELETE',
        `/ab-test/experiments/${experiment.documentId}/variants/c?variants=delete`
      )
    ).data;
    assert.deepEqual(
      removed.variants.map((item) => item.key),
      ['b']
    );

    const gone = await request('GET', `${cm(ARTICLE)}/${added.variants[1].documentId}?locale=en`, {
      auth: true,
    });
    assert.equal(gone.status, 404);
  });

  await check('a completed experiment serves its winner to everyone', async () => {
    const completed = (
      await admin('POST', `/ab-test/experiments/${experiment.documentId}/actions/complete`, {
        winner: 'b',
      })
    ).data;
    assert.equal(completed.status, 'completed');

    const { json } = await api(`/api/articles/${control}`);
    assert.equal(json.data.title, 'Variant title');
    assert.equal(json.data.documentId, control);
  });

  await check('deleting the tested entry removes its experiment and variants', async () => {
    await admin('DELETE', `${cm(ARTICLE)}/${control}?locale=*`);

    const experiments = (await admin('GET', '/ab-test/experiments')).data;
    assert.equal(experiments.length, 0);

    const orphan = await request('GET', `${cm(ARTICLE)}/${variant}?locale=en`, { auth: true });
    assert.equal(orphan.status, 404);
  });

  console.log('\nContent type without locales or Draft & Publish');

  await check('variants work on a plain content type', async () => {
    const page = await createEntry(PAGE, { title: 'Pricing', body: 'Original' });
    const created = (
      await admin('POST', '/ab-test/experiments', {
        contentType: PAGE,
        controlDocumentId: page,
      })
    ).data;
    const pageVariant = created.variants[0].documentId;

    // No Draft & Publish here, so only the content check stands between a copy and visitors.
    const tooEarly = await request(
      'POST',
      `/ab-test/experiments/${created.documentId}/actions/start`,
      { auth: true }
    );
    assert.equal(tooEarly.status, 400);
    assert.match(tooEarly.text, /identical to the original/);

    await admin('PUT', `${cm(PAGE)}/${pageVariant}`, { title: 'Pricing', body: 'Variant' });
    await admin('POST', `/ab-test/experiments/${created.documentId}/actions/start`);

    const forced = await api(`/api/pages/${page}?abVariant=b`);
    assert.equal(forced.json.data.body, 'Variant');
    assert.equal(forced.json.data.documentId, page);

    const list = await api('/api/pages');
    assert.equal(list.json.data.length, 1);
    assert.equal(list.json.meta.pagination.total, 1);
  });

  console.log('\nUntouched variants');

  await check('leaving a fresh copy behind discards it, and the experiment with it', async () => {
    const entry = await createEntry(ARTICLE, { title: 'Discard me', slug: 'discard-me' }, 'en');
    const created = (
      await admin('POST', '/ab-test/experiments', {
        contentType: ARTICLE,
        controlDocumentId: entry,
      })
    ).data;
    const copy = created.variants[0].documentId;

    const result = (
      await admin('POST', `/ab-test/experiments/${created.documentId}/variants/b/discard-unchanged`)
    ).data;
    assert.deepEqual(result, { discarded: true, experimentDeleted: true });

    const gone = await request('GET', `${cm(ARTICLE)}/${copy}?locale=en`, { auth: true });
    assert.equal(gone.status, 404);
    const lookup = await admin(
      'GET',
      `/ab-test/experiments/lookup?contentType=${ARTICLE}&documentId=${entry}`
    );
    assert.equal(lookup.data, null);
  });

  await check('an edited variant is kept', async () => {
    const entry = await createEntry(ARTICLE, { title: 'Keep edits', slug: 'keep-edits' }, 'en');
    const created = (
      await admin('POST', '/ab-test/experiments', {
        contentType: ARTICLE,
        controlDocumentId: entry,
      })
    ).data;
    await saveLocale(ARTICLE, created.variants[0].documentId, { title: 'Edited' }, 'en');

    const result = (
      await admin('POST', `/ab-test/experiments/${created.documentId}/variants/b/discard-unchanged`)
    ).data;
    assert.deepEqual(result, { discarded: false, experimentDeleted: false });

    const still = (await admin('GET', `/ab-test/experiments/${created.documentId}`)).data;
    assert.equal(still.variants.length, 1);
    await admin('DELETE', `/ab-test/experiments/${created.documentId}?variants=delete`);
  });

  await check(
    'deleting a variant entry from the Content Manager updates the experiment',
    async () => {
      const entry = await createEntry(ARTICLE, { title: 'Lose a variant', slug: 'lose-one' }, 'en');
      const created = (
        await admin('POST', '/ab-test/experiments', {
          contentType: ARTICLE,
          controlDocumentId: entry,
        })
      ).data;

      await admin('DELETE', `${cm(ARTICLE)}/${created.variants[0].documentId}?locale=*`);

      const after = (await admin('GET', `/ab-test/experiments/${created.documentId}`)).data;
      assert.deepEqual(after.variants, []);
      await admin('DELETE', `/ab-test/experiments/${created.documentId}`);
    }
  );

  console.log('\nUninstall');

  await check('a content type with experiments cannot be disabled', async () => {
    const result = await request('PUT', '/ab-test/settings', {
      auth: true,
      body: { contentTypes: [ARTICLE] },
    });
    assert.equal(result.status, 400);
  });

  await check('preparing for uninstall keeps variants as unpublished entries', async () => {
    const keep = await createEntry(ARTICLE, { title: 'Keep me', slug: 'keep-me' }, 'en');
    await publish(ARTICLE, keep, 'en');
    const created = (
      await admin('POST', '/ab-test/experiments', {
        contentType: ARTICLE,
        controlDocumentId: keep,
      })
    ).data;
    const keptVariant = created.variants[0].documentId;
    await publish(ARTICLE, keptVariant, 'en');

    const summary = (await admin('POST', '/ab-test/uninstall/prepare', { variants: 'keep' })).data;
    assert.equal(summary.experiments, 2);

    assert.equal((await admin('GET', '/ab-test/experiments')).data.length, 0);
    assert.deepEqual((await admin('GET', '/ab-test/settings')).data.contentTypes, []);

    // The variant is now an ordinary entry: visible to editors, not published to visitors.
    const ids = (await listCm(ARTICLE)).map((entry) => entry.documentId);
    assert.ok(ids.includes(keptVariant));

    const publicList = await api('/api/articles?pagination[pageSize]=100');
    const publicIds = publicList.json.data.map((entry) => entry.documentId);
    assert.ok(publicIds.includes(keep));
    assert.ok(!publicIds.includes(keptVariant));
  });

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
