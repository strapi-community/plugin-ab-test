# A/B Testing for Strapi

`@strapi/plugin-ab-test` lets editors keep several versions of an entry and split Content
API traffic between them. It works with Internationalization (i18n) and Draft & Publish, on REST
and GraphQL.

- Create a variant of any entry from the Content Manager, edit it like a normal entry.
- Decide how much traffic each version gets, when the test runs, and in which locales.
- Your frontend sends a visitor seed; Strapi answers with the version assigned to that visitor.
- Pick a winner when you are done, or delete the experiment.

Requires Strapi 5.37 or later.

## How it works

A variant is a separate document, cloned from the original entry and linked to it by an experiment
record owned by the plugin. It is not an extra "dimension" next to locale and status.

That is what makes it compatible with i18n: each variant has its own locales and its own draft and
published versions. A variant is an ordinary document, so it is edited, translated and published
with the regular Content Manager.

The plugin then does two things at read time:

1. **Hides variants** from the Content API, the Content Manager list and relation pickers, so a
   variant never shows up as an entry of its own.
2. **Swaps** the original for the assigned variant in Content API responses. The response keeps
   the original's `documentId` and uid fields (such as `slug`), so links and caches stay stable.

The plugin adds nothing to your content types: no attribute, no column, no `pluginOptions`.

## Installation

```bash
npm install @strapi/plugin-ab-test
npm run build
```

Then, in the admin panel:

1. **Settings → A/B Testing**: tick the collection types you want to test.
2. **Settings → Roles**: give editors the plugin permissions (`Read experiments`,
   `Create and manage experiments`). Creating or deleting a variant also requires the Content
   Manager create or delete permission on that content type.

## Running an experiment

1. Open an entry of an enabled content type. In the **A/B test** panel, click **Create a variant**
   and name the experiment. Every locale of the entry is copied into a new draft, and you land
   on it. Leave that page without changing and saving anything and the copy is discarded again,
   so a variant only exists once you have edited it.
2. Edit the variant and **publish** it. Visitors only ever get published content.
3. Use the version picker at the top of the A/B test panel to switch between the original and its
   variants. A banner across the top of the page tells you when you are on a variant.
4. Click **Experiment settings**. Everything else happens in that one window:
   - **Traffic split**: the share of visitors per variant; the original gets the remainder.
     **Add Variant C** creates another version. It is available once every existing variant has
     been changed and saved, so untouched copies of the original cannot pile up.
   - **Schedule** and **Locales**: optional start and end dates, and where the test runs.
   - **Start experiment**, then **Pause** or **Resume**. Starting is refused while a variant that
     gets traffic is still identical to the original, or while no variant is published.
   - **Pick a winner** when you have your answer. The winner is served to every visitor from then
     on.
   - **Delete experiment** to go back to the original and clean up.

All experiments are listed under **A/B Testing** in the main navigation, with their status,
traffic split and the time left before a scheduled end.

## Serving variants

### REST

Add `abSeed` to read requests. It is any string that identifies the visitor.

```
GET /api/articles/:documentId?abSeed=visitor-42
GET /api/articles?filters[slug][$eq]=pricing&abSeed=visitor-42
```

```json
{
  "data": {
    "documentId": "ho8q4h7lw2rzn1t7c1e3s3v2",
    "slug": "pricing",
    "title": "Simple pricing for every team",
    "abTest": { "experiment": "article-3f9a1c", "variant": "b" }
  }
}
```

- The same seed always gets the same version of a given experiment.
- `abTest` tells you what was served. Send it to your analytics tool as the exposure event.
  `variant` is `"control"` for the original.
- **Without `abSeed`, the original is served** and no `abTest` key is added. Existing frontends
  keep working unchanged.
- `abVariant=b` (or `abVariant=control`) forces a version while the experiment runs. Use it for
  QA and previews.
- Filters and sorting apply to the original entries; the matching entry is then swapped.

### GraphQL

The same arguments and field are available on queries of collection types:

```graphql
{
  article(documentId: "ho8q4h7lw2rzn1t7c1e3s3v2", abSeed: "visitor-42") {
    title
    slug
    abTest {
      experiment
      variant
    }
  }
}
```

### Locales

Each variant is localized independently. If the assigned variant is not published in the requested
locale, the original is served and the label says so:
`{ "experiment": "…", "variant": "control", "fallback": true }`. Exclude fallbacks from your
analysis, or restrict the experiment to the locales where variants exist.

### Caching and CDNs

The plugin sets no cookie and never assigns randomly on its own, so responses are a pure function
of the URL and stay cacheable.

A unique seed per visitor makes every URL unique. Behind a CDN, send a coarse bucket instead:
compute a number from 0 to 99 once per visitor, store it in a cookie, and send it as the seed.
Each URL then has at most 100 cached versions, and assignment stays sticky.

```ts
// Next.js example
const bucket = cookies().get('ab-bucket')?.value ?? String(Math.floor(Math.random() * 100));
const res = await fetch(`${STRAPI_URL}/api/articles/${id}?abSeed=${bucket}`);
```

The plugin hashes the seed together with the experiment key, so the same bucket lands on
independent sides of different experiments.

## Measuring results

The plugin serves and labels variants. It does not track conversions: use the `abTest` label with
your analytics tool (GA4, PostHog, Plausible…) to compare versions.

## Performance

The plugin registers one document service middleware. Measured on a local development server,
with query counts asserted by the end-to-end suite:

| Request                                                 | Cost added by the plugin                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Any read or write on a content type without experiments | One in-memory lookup. No query.                                                                          |
| Writes on a tested content type                         | None, except a clean-up when a tested entry is deleted.                                                  |
| Single-entry read, no variant served                    | No extra query.                                                                                          |
| List read, no variant served                            | No extra query. The existing queries get a `NOT IN` condition listing the variants of that content type. |
| Read that serves one or more variants                   | One extra read for the whole response, whatever the number of entries.                                   |

Experiments are held in memory and never queried on the request path. Each instance refreshes its
copy after a change, and at most every 30 seconds otherwise (`cacheTtl`), so several instances
sharing a database converge within that delay.

The `NOT IN` condition is the only cost that grows. Over 5,000 entries, a list request of 25
entries took (median):

| Live variants of the content type | SQLite  | Postgres |
| --------------------------------- | ------- | -------- |
| 0                                 | 2.0 ms  | 4.6 ms   |
| 100                               | 2.7 ms  | 7.0 ms   |
| 1,000                             | 5.2 ms  | 10.9 ms  |
| 5,000                             | 14.8 ms | 24.6 ms  |

Small differences are within measurement noise. In practice the cost is negligible up to a few
hundred live variants per content type. Delete experiments you no longer need: their variants
leave the list.

## Uninstalling

The plugin stores everything it owns in its own table and one settings key. Your content tables
and schema files are never modified, so removing the package cannot break the application.

Variants, however, are real entries. Once the plugin is gone nothing hides them, and published
variants would appear as separate entries in your API. To uninstall cleanly:

1. Remove `abSeed` and `abVariant` from your frontend requests. With `api.rest.strictParams`
   enabled, Strapi rejects unknown query params once the plugin no longer declares them.
2. In **Settings → A/B Testing**, click **Prepare for uninstall** and choose whether to delete the
   variants or keep them as unpublished drafts. This removes every experiment and the settings.
   On content types without Draft & Publish, kept variants remain regular entries.
3. Remove the package and rebuild: `npm uninstall @strapi/plugin-ab-test && npm run build`.

On the next start Strapi drops the plugin's table. Nothing else is left behind.

## Configuration

```ts
// config/plugins.ts
export default {
  'ab-test': {
    config: {
      // How long an instance serves from memory before re-reading experiments, in ms.
      cacheTtl: 30000,
    },
  },
};
```

## Telemetry

The plugin reports anonymous usage through
[Strapi's own telemetry](https://docs.strapi.io/cms/usage-information), so it follows the
project's setting: with `STRAPI_TELEMETRY_DISABLED=true`, or `telemetryDisabled` in the `strapi`
key of `package.json`, nothing is sent.

| Event                         | Sent when                                              | Properties                                                                            |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `didInitializeABTest`         | Strapi starts                                          | Number of enabled content types, of experiments, and of running experiments           |
| `didUpdateABTestSettings`     | The settings are saved                                 | Number of enabled content types                                                       |
| `didCreateABTestExperiment`   | An experiment is created                               | None                                                                                  |
| `didStartABTestExperiment`    | An experiment is started or resumed                    | Number of variants, whether it has a schedule, whether it is limited to some locales  |
| `didPauseABTestExperiment`    | An experiment is paused                                | Number of variants                                                                    |
| `didCompleteABTestExperiment` | An experiment is completed                             | Number of variants, whether the original or a variant won                             |
| `didAddABTestVariant`         | A variant is added to an experiment                    | Number of variants                                                                    |
| `didRemoveABTestVariant`      | A variant is removed                                   | Whether the variant was deleted or kept                                               |
| `didDiscardABTestVariant`     | An untouched variant is dropped when its editor leaves | Whether the experiment went with it                                                   |
| `didDeleteABTestExperiment`   | An experiment is deleted                               | Whether its variants were deleted or kept                                             |
| `didPrepareABTestUninstall`   | **Prepare for uninstall** is run                       | Number of experiments and variants removed, whether the variants were deleted or kept |

Events only carry counts and flags: never an experiment name, key or hypothesis, a content type,
a document id or a locale. Nothing is sent when variants are served, so the Content API path is
unaffected.

## Limitations

- Collection types only. Single types are not supported.
- Variants are swapped for entries returned at the top level of a response. An entry reached
  through a populated relation is returned as the original.
- Content types with a unique field that is neither a uid nor text cannot have variants, because
  the clone could not be given a distinct value.
- A document can belong to one experiment at a time.
- No audience targeting. Visitors are split by percentage only.

## Developing

```bash
npm install
npm run build          # build the plugin
npm test               # unit tests
```

`playground/` is a Strapi application used for end-to-end tests. It has a localized Article type
with Draft & Publish, a plain Page type, a second locale, and public read access.

```bash
npm run build && npm run playground:sync          # copy the build into the playground
cd playground && cp .env.example .env && npm install
PORT=1447 npm run develop

# after changing the plugin: rebuild, sync, restart the playground
npm run build && npm run playground:sync

# end-to-end suite: it wipes the database, so run the playground on a scratch one
PORT=1447 DATABASE_FILENAME=.tmp/e2e.db npm run develop
node tests/e2e/run.mjs
```

The suite refuses to run against any database other than `.tmp/e2e.db`.

The playground loads the plugin from `playground/.ab-test`, a copy made by `playground:sync`. A
symlink to the repository would make the admin panel bundle a second copy of React.

The end-to-end suite asserts query counts through a small test middleware in
`playground/src/index.ts`, and creates its own admin user on first run.
