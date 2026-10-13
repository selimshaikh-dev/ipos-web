
export interface WorkspaceOptionsResponse {
  readonly companies: readonly WorkspaceCompanyOption[];
}

export interface WorkspaceCompanyOption {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly branches: readonly WorkspaceBranchOption[];
}

export interface WorkspaceBranchOption {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly isHeadOffice: boolean;
  readonly posCounters: readonly WorkspacePosCounterOption[];
}

export interface WorkspacePosCounterOption {
  readonly id: number;
  readonly code: string;
  readonly name: string;
}