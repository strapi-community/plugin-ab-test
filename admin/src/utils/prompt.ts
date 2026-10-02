import type { ContentTypeInfo, Experiment, PosthogConnection } from '../types';

export interface PromptInput {
  /** The content types A/B testing is enabled on. */
  contentTypes: Array<Pick<ContentTypeInfo, 'uid' | 'displayName' | 'singularName' | 'pluralName'>>;
  experiments: Array<Pick<Experiment, 'name' | 'key' | 'contentType' | 'status' | 'goal'>>;
  /** Where this Strapi reads results from, which makes the event names binding. Null if nowhere. */
  posthog: Pick<PosthogConnection, 'host' | 'projectId'> | null;
}

type ContentTypes = PromptInput['contentTypes'];

const contentTypeLines = (contentTypes: ContentTypes) =>
  contentTypes
    .map(
      (type) =>
        `- ${type.displayName}: REST \`/api/${type.pluralName}\`, GraphQL queries \`${type.singularName}\` and \`${type.pluralName}\``
    )
    .join('\n');

/** The success metrics editors chose, which the frontend has to report under these names. */
const successMetrics = ({ contentTypes, experiments }: PromptInput) => {
  const nameOf = (uid: string) => contentTypes.find((type) => type.uid === uid)?.displayName ?? uid;

  const lines = experiments
    .filter((experiment) => experiment.status !== 'completed' && experiment.goal)
    .map((experiment) => {
      const metric =
        experiment.goal?.type === 'conversion'
          ? `a conversion, counted when the event \`${experiment.goal.event}\` is sent`
          : 'page views, counted from the page view events of the analytics tool';

      return `- Experiment "${experiment.name}" (key \`${experiment.key}\`, on ${nameOf(experiment.contentType)}): ${metric}`;
    });

  if (lines.length === 0) {
    return 'No experiment has a success metric yet. List the events this frontend already sends that could serve as one (form submissions, sign-ups, purchases, clicks on a call to action), with their exact names, so I can type one in the settings of an experiment.';
  }

  return `These are the success metrics of the current experiments. The key is what \`abTest.experiment\` contains for that experiment. Editors add experiments over time, so this list will change.

${lines.join('\n')}

If the frontend sends an event that looks like one of these conversions under another name, do not rename it on your own: tell me. I can rename the event here or change the success metric in Strapi, and other dashboards may depend on the current name.`;
};

const convention = (posthog: PromptInput['posthog']) =>
  posthog
    ? `This Strapi reads the results of experiments from PostHog and shows them to editors. That only works if the events follow this convention exactly, so report any difference as wrong, not as a matter of style:

- the exposure event is named \`ab_test_exposure\`, with the properties \`experiment\` (from \`abTest.experiment\`) and \`variant\` (from \`abTest.variant\`);
- a conversion event has exactly the name of the success metric;
- page views are counted from PostHog's own \`$pageview\` events: they are what a "page views" success metric counts, so an experiment with that metric shows nothing if they are not captured, including on client-side navigations;
- all of them go to the PostHog project Strapi reads: project \`${posthog.projectId}\` on \`${posthog.host}\`. You can usually not read the project token from the code: tell me which host the frontend sends to and which variable holds the token, so I can compare.

Strapi counts distinct PostHog persons. If this frontend reports to another tool than PostHog, say so: the results will not show up in Strapi.`
    : `This Strapi does not read results itself: versions are compared in the analytics tool. Event names are therefore free, but use this convention unless the project already has one, because the plugin can read results from PostHog if it is connected later:

- the exposure event is named \`ab_test_exposure\`, with the properties \`experiment\` (from \`abTest.experiment\`) and \`variant\` (from \`abTest.variant\`);
- a conversion event has exactly the name of the success metric.`;

/** The reference snippet, on a content type of this project rather than a made-up one. */
const example = ([type]: ContentTypes) => {
  const path = type?.pluralName ?? 'articles';
  const key = `${type?.singularName ?? 'article'}-3f9a1c`;

  return `// 1. Read the content with the seed.
const res = await fetch(
  \`\${STRAPI_URL}/api/${path}?filters[slug][$eq]=\${slug}&abSeed=\${encodeURIComponent(seed)}\`
);
const { data } = await res.json();
// data[0].abTest → { experiment: '${key}', variant: 'b' }

// 2. Exposure, in the browser, once the entry is displayed.
const { abTest } = data[0];

if (abTest && !abTest.fallback) {
  posthog.capture('ab_test_exposure', {
    experiment: abTest.experiment,
    variant: abTest.variant,
  });
}

// 3. Conversion, when the visitor completes the action: the name of the success metric.
posthog.capture('form_submitted');`;
};

/**
 * A prompt for a coding assistant working in the codebase of the frontend: send the seed on
 * the requests that need it, then audit how exposures and conversions reach analytics. Built
 * from the state of this Strapi, so the assistant gets its content types and its metrics
 * rather than placeholders.
 */
export const buildFrontendPrompt = (input: PromptInput): string =>
  `I need your help in this codebase. It is the frontend of a website whose content comes from a Strapi 5 backend with the A/B Testing plugin (@strapi/plugin-ab-test). There are two jobs: make this frontend serve A/B test variants, then audit how it reports results to analytics.

Read "How the plugin works" first: everything else depends on it.

## How the plugin works

- In Strapi, an editor creates one or more variants of an entry and starts an experiment. Strapi then answers a read request for that entry with the original or with a variant, depending on the visitor. This applies to single entries and to entries in a list alike.
- Strapi knows the visitor only through \`abSeed\`, a parameter the frontend adds to its read requests: a query parameter in REST, an argument of the query in GraphQL. Any string works, and the same seed always gets the same version of a given experiment.
- Without \`abSeed\`, Strapi always returns the original. Nothing breaks, but no visitor ever sees a variant: until the frontend sends the seed, experiments have no effect.
- An entry served as part of a running experiment carries an \`abTest\` field, such as \`{ "experiment": "article-3f9a1c", "variant": "b" }\`. \`experiment\` is the key of the experiment. \`variant\` is \`control\` for the original, or the key of a variant (\`b\`, \`c\`…). \`fallback: true\` is added when the visitor was assigned a variant that is not published in the requested locale and got the original instead.
- A served variant keeps the \`documentId\` and the uid fields (such as \`slug\`) of the original, so links, routes and cache keys do not change. Only the content differs.
- Strapi sets no cookie and remembers nothing about visitors. Creating the seed and keeping it stable is the job of the frontend.
- Only entries returned at the top level of a response are swapped. An entry reached through a populated relation is always the original.
- Strapi measures nothing: it receives no event and counts no visitor. Results come from the analytics tool the frontend reports to.

## Content types under test

A/B testing is enabled on the content types below, and on no other. Only read requests for them need \`abSeed\`:

${contentTypeLines(input.contentTypes)}

These are the default routes and query names of Strapi. If this project reads these content types through custom routes, those count too.

## Part 1: send the seed

1. Find every place this frontend reads these content types from Strapi: fetch calls, a Strapi client or SDK, GraphQL queries, server components, loaders, route handlers, static generation. List them before changing anything.
2. Find out what is shared between visitors, because it decides what the seed can be. Two things can be shared, and a project often has both:
   - the responses of Strapi (a fetch or data cache, a CDN in front of the API);
   - the rendered pages (static generation, incremental static regeneration, a CDN in front of the site).
3. Choose the seed accordingly.
   - If nothing is shared, the seed can be a unique id per visitor. If the project already has its own first-party visitor id, reuse it. The id of an analytics tool does not count: it can be reset, and it is not available on the server.
   - If Strapi responses are shared, a unique seed makes every URL unique and defeats the cache. Use a bucket instead: a random integer from 0 to 99, picked once per visitor and sent as the seed. Strapi hashes the seed with the experiment key, so a bucket splits traffic as well as a unique id does. The cache must vary on the bucket, so that the version of one visitor is never served to another.
   - If rendered pages are shared, one page cannot show different versions, whatever the seed. Do not send a constant seed, which would put every visitor on the same version. Tell me which pages are concerned and propose an approach, for example rendering them per request, a middleware that routes each bucket to its own cached copy, or fetching the tested entries in the browser.
4. Store the seed in a first-party cookie, created once, so it stays the same across pages and visits, on the server and in the browser.
   - The very first request of a visitor must already use the seed that gets stored, not a different one or none.
   - The cookie is input from the visitor that ends up in a cache key: check that it is a valid seed (a bucket in range) before using it.
   - When no seed is available (a build, a crawler without cookies), send no \`abSeed\` at all: the original is served.
5. Add \`abSeed\` to every request found in step 1, and only to those: read requests for the content types above. Not to writes, and not to other content types.
6. Keep \`abTest\` available to the code that renders the entry. If responses go through a mapper, a serializer or a type that keeps known fields only, let \`abTest\` through and add it to the types: \`abTest?: { experiment: string; variant: string; fallback?: true }\`. In GraphQL, select it: \`abTest { experiment variant fallback }\`.
7. Do not change what is rendered or how URLs are built: Strapi already swapped the content and kept the identity of the original.
8. If one of the content types above is read only through a populated relation somewhere, those entries are never swapped. Report where, and leave the code as it is: whether to fetch them differently is my decision.

Strapi also accepts \`abVariant=b\` (or \`abVariant=control\`) to force a version. It is for previews and QA: there is nothing to build for it unless I ask.

## Part 2: audit the analytics

Find which analytics tools this frontend uses (PostHog, Amplitude, Google Analytics, Segment, Mixpanel, Plausible…) and how events are sent. Then check each point below against the code as it is now, before your changes. Give each a status (OK, missing, wrong, not applicable, or cannot tell from the code) with the file and line that shows it. Where Part 1 will change the answer, say what it becomes.

1. Exposure. When an entry that carries \`abTest\` is displayed, an event is sent with the experiment key and the variant.
   - For every version, \`control\` included: the original is one of the versions being compared.
   - For every entry that carries \`abTest\`, on list pages too: Strapi swaps entries in lists, so a list that shows a tested entry exposes the visitor to it.
   - From the browser, when the entry is displayed. Not during server rendering, where crawlers and prefetched pages would be counted as visitors.
   - Once per page view of the entry, not on every re-render.
   - Not when \`abTest\` is absent, nor when \`abTest.fallback\` is true.
2. Conversion. The events that count as success are sent when the visitor has completed the action, not when it is attempted or has failed, under exactly the expected names (see "Success metrics").
3. Same visitor. The exposure and the conversion are sent by the same analytics client, with the same visitor identity, so the tool can link them. Look for anything that resets or changes that identity between the two: a reset on navigation or on logout, a second client instance, events sent from the server under another id.
4. Stable assignment. For one visitor, the seed is the same on the server and in the browser, so the version does not flicker at hydration, and the same from one page and one visit to the next.
5. Caching. No cached response or page can be served to a visitor whose seed would have given another version.
6. Consent. If analytics waits for the consent of the visitor, say what happens to exposures before consent: visitors who see a variant and are never counted skew the results. Do not put the seed cookie behind consent on your own: it selects content rather than tracking, but whether it needs consent on this site is my decision, so raise it.

### Success metrics

${successMetrics(input)}

### Event names

${convention(input.posthog)}

For reference, with PostHog (the same shape applies to any tool):

\`\`\`ts
${example(input.contentTypes)}
\`\`\`

## How to work

1. Start by reading. Then send me what you found (the requests, what is shared between visitors, the analytics tools, the audit) and what you plan to change. Stop there and wait for my answer: do not edit anything before I reply.
2. Once I reply, make the changes of Part 1, and fix in Part 2 what is missing or wrong when the fix is clear.
3. Ask me instead of deciding when a fix would rename or remove something that exists: an event already sent under another name, a behaviour that looks deliberate (a comment explains it, for instance) even if it breaks a check, anything a visitor would notice.
4. Follow the patterns of this codebase: one shared helper for the seed rather than a copy in each request, the existing analytics wrapper if there is one, no new dependency unless it is needed.
5. Never hard-code an experiment key or a variant: they come from \`abTest\` at run time.
6. Finish with a report: the files changed, the audit as a table (check, status, evidence, what you did), and the open questions.
`;
