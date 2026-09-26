export type FeatureRuntimeStatus =
  | "idle"
  | "starting"
  | "enabled"
  | "stopping"
  | "disabled"
  | "error"
  | "reload-required";

export type FeatureFailureStage = "storage" | "setup" | "teardown" | "cleanup";

export interface FeatureFailure {
  readonly stage: FeatureFailureStage;
  readonly retryable: boolean;
}

export interface FeatureStateSnapshot {
  readonly id: string;
  readonly enabled: boolean;
  readonly applied: boolean | null;
  readonly runtime: FeatureRuntimeStatus;
  readonly error: FeatureFailure | null;
  readonly persistence: "persistent" | "session";
}

export type FeatureStateListener = (state: FeatureStateSnapshot) => void;

export interface FeatureStateAccess {
  getState(id: string): FeatureStateSnapshot;
  subscribe(listener: FeatureStateListener): () => void;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}
