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
  beforeReferences?: ValueReference[];
  afterReferences?: ValueReference[];
  oldLine?: number;
  newLine?: number;
}
// Ranges refer to the unchanged raw value; only presentation replaces them.
export interface ValueReference {
  start: number;
  end: number;
  label: string;
  target: string;
  className: string;
  resourcePath?: string;
}
export interface ReviewFileTarget {
  path: string;
  previousPath?: string;
  status: SceneReview["status"];
  reviewUrl?: string;
}
export interface ReferenceNavigation {
  changesUrl: string;
  repositoryUrl: string;
  beforeRevision?: string;
  afterRevision?: string;
  files: ReviewFileTarget[];
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
  partialListing?: boolean;
  navigation?: ReferenceNavigation;
}
