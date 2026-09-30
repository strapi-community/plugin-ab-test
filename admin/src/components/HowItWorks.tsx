import * as React from 'react';

import { Accordion, Box, Flex, Typography } from '@strapi/design-system';
import { Code, Earth, Feather } from '@strapi/icons';
import { styled } from 'styled-components';

import { useRichT, useT } from '../utils/useT';

const Snippet = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.spaces[4]};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral100};
  color: ${({ theme }) => theme.colors.neutral800};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: ${({ theme }) => theme.fontSizes[1]};
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
`;

const Param = styled.code`
  padding: 0 ${({ theme }) => theme.spaces[1]};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.neutral150};
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
`;

const EXAMPLE = `// Give each visitor a stable seed once, for example in a cookie.
const seed = getCookie('ab-seed') ?? setCookie('ab-seed', crypto.randomUUID());

// Send it with every read: the same seed always gets the same version.
const res = await fetch(\`\${STRAPI_URL}/api/pages?filters[slug][$eq]=contact&abSeed=\${seed}\`);
const { data } = await res.json();

// Tell your analytics tool which version this visitor saw.
// data[0].abTest → { experiment: 'contact-headline', variant: 'b' }   ('control' = original)`;

/** A short paragraph with a bold lead-in. */
const Point = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Typography>
    <Typography fontWeight="bold">{title}</Typography> {children}
  </Typography>
);

const Section = ({ children }: { children: React.ReactNode }) => (
  <Box padding={6}>
    <Flex direction="column" alignItems="stretch" gap={3}>
      {children}
    </Flex>
  </Box>
);

/**
 * What an editor or developer needs to know before relying on the plugin: how the frontend
 * asks for variants, and how variants relate to Draft & Publish and to locales.
 */
const HowItWorks = () => {
  const t = useT();
  const rich = useRichT();

  return (
    <Accordion.Root size="S">
      <Accordion.Item value="frontend">
        <Accordion.Header>
          <Accordion.Trigger
            icon={Code}
            description={t(
              'guide.description',
              'Without abSeed the API always returns the original, so nothing changes until your frontend sends it.'
            )}
          >
            {t('guide.title', 'How to serve variants from your frontend')}
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          <Section>
            <Point title={t('guide.seed.title', 'Send a seed.')}>
              {rich(
                'guide.seed',
                'Add {param} to read requests, REST or GraphQL, with a stable id per visitor. Strapi hashes it to pick a version, so the same visitor always gets the same one and responses stay cacheable. Behind a CDN, send a number from 0 to 99 instead of a unique id to cap cache variations.',
                { param: <Param>abSeed</Param> }
              )}
            </Point>
            <Point title={t('guide.label.title', 'Read the label.')}>
              {rich(
                'guide.label',
                'Served entries carry {param} with the experiment key and the version, "control" for the original. Send it to your analytics tool to compare versions. {fallback} means the variant was not published in that locale and the original was returned.',
                { param: <Param>abTest</Param>, fallback: <Param>fallback: true</Param> }
              )}
            </Point>
            <Point title={t('guide.preview.title', 'Preview a version.')}>
              {rich(
                'guide.preview',
                '{param} forces Variant B for one request, {control} forces the original.',
                { param: <Param>abVariant=b</Param>, control: <Param>abVariant=control</Param> }
              )}
            </Point>
            <Snippet>{EXAMPLE}</Snippet>
          </Section>
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="draft-and-publish">
        <Accordion.Header>
          <Accordion.Trigger
            icon={Feather}
            description={t(
              'guide.dp.description',
              'A variant is an ordinary entry with its own draft and published versions.'
            )}
          >
            {t('guide.dp.title', 'Draft & Publish')}
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          <Section>
            <Point title={t('guide.dp.draft.title', 'A variant starts as a draft.')}>
              {t(
                'guide.dp.draft',
                'Creating one copies the drafts of the original. Publish it like any entry, per locale. Publishing or unpublishing the original never touches its variants, and the other way round.'
              )}
            </Point>
            <Point title={t('guide.dp.served.title', 'Visitors only get published versions.')}>
              {rich(
                'guide.dp.served',
                "A visitor assigned to a variant that has no published version in the requested locale gets the original, labelled {fallback}. Editing a variant's draft changes nothing for visitors until it is published, and unpublishing a variant sends its visitors back to the original.",
                { fallback: <Param>fallback: true</Param> }
              )}
            </Point>
            <Point title={t('guide.dp.start.title', 'Starting needs a published variant.')}>
              {t(
                'guide.dp.start',
                'An experiment cannot start while none of the variants that get traffic is published, or while one of them is still identical to the original.'
              )}
            </Point>
            <Point title={t('guide.dp.keep.title', 'Kept variants are unpublished.')}>
              {t(
                'guide.dp.keep',
                'Choosing to keep variants when deleting an experiment unpublishes them, so they stay as drafts in the Content Manager. On a content type without Draft & Publish they become regular entries instead.'
              )}
            </Point>
          </Section>
        </Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="locales">
        <Accordion.Header>
          <Accordion.Trigger
            icon={Earth}
            description={t(
              'guide.i18n.description',
              'Each variant has its own locales; a locale without a published variant serves the original.'
            )}
          >
            {t('guide.i18n.title', 'Internationalization')}
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>
          <Section>
            <Point title={t('guide.i18n.copy.title', 'Every locale is copied.')}>
              {t(
                'guide.i18n.copy',
                'A new variant gets a copy of the original in each of its locales. From there each locale of the variant is edited, translated and published on its own, so a variant can be live in some locales and not in others.'
              )}
            </Point>
            <Point title={t('guide.i18n.scope.title', 'Scope the experiment.')}>
              {rich(
                'guide.i18n.scope',
                'Experiment settings let you restrict a test to some locales; elsewhere the original is served. Keep a test to the locales where its variants are published, otherwise visitors of the other locales are counted with {fallback} in the label.',
                { fallback: <Param>fallback: true</Param> }
              )}
            </Point>
            <Point title={t('guide.i18n.seed.title', 'One assignment across locales.')}>
              {t(
                'guide.i18n.seed',
                'The seed is hashed with the experiment key only, so a visitor who switches language keeps the same version.'
              )}
            </Point>
          </Section>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};

export { HowItWorks };
