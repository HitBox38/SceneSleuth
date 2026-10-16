export type SectionKind =
  | "node"
  | "ext_resource"
  | "sub_resource"
  | "connection"
  | "scene"
  | "unknown";
export type Operation = "added" | "removed" | "modified";
export interface SourceLine {
  text: string;
  line: number;
  changed: boolean;
}
export interface SceneValue {
  raw: string;
  canonical: string;
  line: number;
  changed: boolean;
}
export interface SceneSection {
  id: string;
  kind: SectionKind;
  label: string;
  className: string;
  path: string;
  line: number;
  headerChanged: boolean;
  attributes: Map<string, SceneValue>;
  properties: Map<string, SceneValue>;
}
export interface PropertyChange {
  name: string;
  operation: Operation;
  before?: string;
  after?: string;
  oldLine?: number;
  newLine?: number;
}
export interface SectionChange {
  id: string;
  kind: SectionKind;
  operation: Operation;
  label: string;
  className: string;
  path: string;
  oldLine?: number;
  newLine?: number;
  properties: PropertyChange[];
}
export interface SceneReview {
  filePath: string;
  previousPath?: string;
  status: "added" | "removed" | "modified" | "renamed";
  coverage: "complete" | "partial";
  additions: number;
  deletions: number;
  changes: SectionChange[];
  diagnostics: string[];
  rawDiff: string;
  pending?: boolean;
  reviewUrl?: string;
}
export interface ReviewSnapshot {
  reviewKey: string;
  title: string;
  status: "loading" | "ready" | "error";
  files: SceneReview[];
  error?: string;
  changesUrl?: string;
}
