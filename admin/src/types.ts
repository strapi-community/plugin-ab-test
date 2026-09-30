export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed';

export type DisposeMode = 'delete' | 'keep';

export interface Variant {
  key: string;
  documentId: string;
  weight: number;
}

export interface Experiment {
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
  weights?: Record<string, number>;
  startAt?: string | null;
  endAt?: string | null;
  locales?: string[] | null;
}
