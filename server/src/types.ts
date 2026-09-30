export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

/** What happens to a variant document when it leaves an experiment. */
export type DisposeMode = 'delete' | 'keep';

export interface Variant {
  key: string;
  documentId: string;
  /** Share of traffic, in percent. The control gets the remainder. */
  weight: number;
}

export interface Experiment {
  id: number;
  documentId: string;
  key: string;
  name: string;
  hypothesis: string | null;
  contentType: string;
  controlDocumentId: string;
  variants: Variant[];
  status: ExperimentStatus;
  startAt: string | null;
  endAt: string | null;
  locales: string[] | null;
  winner: string | null;
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
