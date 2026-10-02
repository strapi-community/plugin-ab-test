export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

/** What happens to a variant document when it leaves an experiment. */
export type DisposeMode = 'delete' | 'keep';

export interface Variant {
  key: string;
  documentId: string;
  /** Share of traffic, in percent. The control gets the remainder. */
  weight: number;
}

export type GoalType = 'conversion' | 'pageviews';

/** The success metric of an experiment: what its versions are compared on. */
export interface Goal {
  type: GoalType;
  /** The event the frontend reports for a conversion. Null for page views. */
  event: string | null;
}

export interface Experiment {
  id: number;
  documentId: string;
  key: string;
  name: string;
  hypothesis: string | null;
  goal: Goal | null;
  contentType: string;
  controlDocumentId: string;
  variants: Variant[];
  status: ExperimentStatus;
  startAt: string | null;
  endAt: string | null;
  locales: string[] | null;
  winner: string | null;
  createdAt: string | null;
}

/** Where results are read from, without the API key. */
export interface PosthogConnection {
  connected: boolean;
  host: string | null;
  projectId: string | null;
  /** `config` for the plugin config file, which wins; `settings` for the settings page. */
  source: 'config' | 'settings' | null;
  /** The ends of the key, to recognise it. */
  keyHint: string | null;
}

export interface VersionResult {
  /** `control` or a variant key. */
  key: string;
  /** Visitors who reported an exposure to this version. */
  visitors: number;
  /** Visitors who converted after their exposure, or page views after it. */
  count: number;
  /** Conversion rate from 0 to 1, or page views per visitor. Null without visitors. */
  value: number | null;
  /** Relative difference with the original. Null for the original, or when it has no value. */
  uplift: number | null;
  /** 1 - p-value against the original. Null while the samples are too small to tell. */
  significance: number | null;
}

/** What the admin panel shows for an experiment. Results are optional: see `connected`. */
export interface Results {
  connected: boolean;
  goal: Goal | null;
  versions: VersionResult[];
  fetchedAt: string | null;
  /** Why PostHog could not be read, in words an administrator can act on. */
  error: string | null;
}

export interface Settings {
  contentTypes: string[];
}

/** The subset of an experiment needed to pick a variant on the request path. */
export interface ServingExperiment {
  key: string;
  status: ExperimentStatus;
  variants: Variant[];
  winner: string | null;
  startMs: number | null;
  endMs: number | null;
  locales: Set<string> | null;
}

export interface TypeState {
  /** Every variant documentId of this content type, whatever the experiment status. */
  variantIds: string[];
  variants: Set<string>;
  controls: Set<string>;
  /** Experiments that can change what is served, keyed by control documentId. */
  serving: Map<string, ServingExperiment>;
  uidFields: string[];
  localized: boolean;
}

export interface RegistryState {
  types: Map<string, TypeState>;
}

export interface Assignment {
  experiment: string;
  variant: string;
  /** Set when the assigned variant could not be served and the control was returned instead. */
  fallback?: true;
}
