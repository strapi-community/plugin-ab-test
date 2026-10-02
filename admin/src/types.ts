export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

export type DisposeMode = 'delete' | 'keep';

export interface Variant {
  key: string;
  documentId: string;
  weight: number;
}

export type GoalType = 'conversion' | 'pageviews';

export interface Goal {
  type: GoalType;
  /** The event the frontend reports for a conversion. Null for page views. */
  event: string | null;
}

export interface Experiment {
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
}

/** Where results are read from. The plugin works without it. */
export interface PosthogConnection {
  connected: boolean;
  host: string | null;
  projectId: string | null;
  /** `config` when set in the plugin config file, which cannot be changed from the admin. */
  source: 'config' | 'settings' | null;
  /** The ends of the saved key. The key itself never comes back from the server. */
  keyHint: string | null;
}

export interface PosthogInput {
  host: string;
  projectId: string;
  /** Empty to keep the key already saved. */
  personalApiKey: string;
}

export interface VersionResult {
  key: string;
  visitors: number;
  /** Conversions, or page views after the exposure. */
  count: number;
  /** Conversion rate from 0 to 1, or page views per visitor. */
  value: number | null;
  uplift: number | null;
  significance: number | null;
}

export interface Results {
  connected: boolean;
  goal: Goal | null;
  versions: VersionResult[];
  fetchedAt: string | null;
  error: string | null;
}

export interface Lookup {
  experiment: Experiment;
  role: 'control' | 'variant';
  variantKey: string;
}

export type ExperimentSummary = Pick<Experiment, 'documentId' | 'key' | 'name' | 'status'>;

export interface ContentTypeInfo {
  uid: string;
  displayName: string;
  localized: boolean;
  draftAndPublish: boolean;
  enabled: boolean;
}

export interface ExperimentUpdate {
  name?: string;
  hypothesis?: string | null;
  goal?: Goal | null;
  weights?: Record<string, number>;
  startAt?: string | null;
  endAt?: string | null;
  locales?: string[] | null;
}
