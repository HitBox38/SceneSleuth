import { useState } from "react";
import { Search, GitBranch, Layers, ArrowUpRight, RefreshCw, X, ChevronDown } from "lucide-react";
import { Button } from "../popup/src/components/ui/button.tsx";
import { LinkButton } from "../popup/src/components/ui/button.tsx";
import type {
  ReviewSnapshot,
  SceneReview,
  SectionChange,
  SectionKind,
  ValueReference,
} from "../shared/model.ts";
import { inlineFileContents } from "./fileContents.ts";

const labels: Record<SectionKind, string> = {
  node: "Node",
  ext_resource: "External resource",
  sub_resource: "Resource",
  connection: "Signal",
  scene: "Scene",
  unknown: "Unresolved",
};
const kindGroups = {
  all: "All changes",
  node: "Nodes",
  resource: "Resources",
  connection: "Signals",
} as const;
type Filter = keyof typeof kindGroups;
function matchesKind(change: SectionChange, filter: Filter) {
  return (
    filter === "all" ||
    (filter === "resource"
      ? ["ext_resource", "sub_resource"].includes(change.kind)
      : change.kind === filter)
  );
}
export function sceneStats(files: SceneReview[]) {
  const changes = files.flatMap((file) => file.changes);
  return {
    nodes: changes.filter((item) => item.kind === "node").length,
    resources: changes.filter((item) => item.kind.includes("resource")).length,
    signals: changes.filter((item) => item.kind === "connection").length,
    properties: changes.reduce((sum, item) => sum + item.properties.length, 0),
  };
}
function ReferenceValue({ raw, references }: { raw?: string; references?: ValueReference[] }) {
  if (raw === undefined) return "—";
  if (!references?.length) return raw;
  return (
    <>
      {references.map((reference, index) => (
        <span key={reference.start}>
          {raw.slice(index ? references[index - 1].end : 0, reference.start)}
          <span
            className="ss-reference"
            title={`${reference.className ? reference.className + " · " : ""}${reference.target}\n${raw.slice(reference.start, reference.end)}`}
          >
            {reference.label}
          </span>
        </span>
      ))}
      {raw.slice(references[references.length - 1].end)}
    </>
  );
}
function ChangedSection({
  change,
  reviewUrl,
  compact = false,
}: {
  change: SectionChange;
  reviewUrl?: string;
  compact?: boolean;
}) {
  const path = compact
    ? change.path && change.path !== "." && change.path !== change.label
      ? change.path
      : undefined
    : change.path || labels[change.kind];
  return (
    <details className="ss-section" open={change.kind === "node" || change.kind === "unknown"}>
      <summary>
        <span className={`ss-operation ss-${change.operation}`}>
          {change.operation === "added" ? "+" : change.operation === "removed" ? "−" : "~"}
        </span>
        <span className="ss-section-name">
          {change.label}
          {path && <span className="ss-section-path">{path}</span>}
        </span>
        <span className="ss-type">{change.className || labels[change.kind]}</span>
        <ChevronDown size={13} />
      </summary>
      <div className="ss-section-meta">
        <span>
          {labels[change.kind]} · {change.operation}
        </span>
        <span>
          {change.oldLine &&
            (reviewUrl ? (
              <a href={`${reviewUrl}L${change.oldLine}`}>Before L{change.oldLine}</a>
            ) : (
              `Before L${change.oldLine}`
            ))}
          {change.oldLine && change.newLine ? " · " : ""}
          {change.newLine &&
            (reviewUrl ? (
              <a href={`${reviewUrl}R${change.newLine}`}>After L{change.newLine}</a>
            ) : (
              `After L${change.newLine}`
            ))}
        </span>
      </div>
      {change.properties.length > 0 ? (
        <div className="ss-properties">
          <div className="ss-property ss-property-head">
            <span>Property</span>
            <span>Before</span>
            <span>After</span>
          </div>
          {change.properties.map((property, index) => (
            <div
              className={`ss-property ss-${property.operation}`}
              key={`${property.name}:${index}`}
            >
              <span className="ss-property-name">
                {property.name.startsWith("@") ? property.name.slice(1) : property.name}
                <small>
                  {property.operation}
                  {property.newLine
                    ? ` · L${property.newLine}`
                    : property.oldLine
                      ? ` · L${property.oldLine}`
                      : ""}
                </small>
              </span>
              <code className="ss-before">
                <ReferenceValue raw={property.before} references={property.beforeReferences} />
              </code>
              <code className="ss-after">
                <ReferenceValue raw={property.after} references={property.afterReferences} />
              </code>
            </div>
          ))}
        </div>
      ) : (
        <p className="ss-muted ss-padding">
          Section {change.operation}; no properties are present in this diff.
        </p>
      )}
    </details>
  );
}
export function FileReview({
  file,
  filter,
  search,
  embedded = false,
}: {
  file: SceneReview;
  filter: Filter;
  search: string;
  embedded?: boolean;
}) {
  const changes = file.changes.filter(
    (change) =>
      matchesKind(change, filter) &&
      `${change.label} ${change.path} ${change.className} ${change.properties.map((p) => `${p.name} ${p.before ?? ""} ${p.after ?? ""} ${[...(p.beforeReferences ?? []), ...(p.afterReferences ?? [])].map((reference) => `${reference.label} ${reference.target}`).join(" ")}`).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <article
      className="ss-file"
      aria-label={
        embedded
          ? `${file.coverage === "partial" ? "Partial scene diff" : "Scene diff"} for ${file.filePath}`
          : undefined
      }
    >
      {!embedded && (
        <header className="ss-file-header">
          <div>
            <h2>{file.filePath}</h2>
            {file.previousPath && <p className="ss-muted">Previously {file.previousPath}</p>}
          </div>
          <span className="ss-line-count">
            <span>+{file.additions}</span> <span>−{file.deletions}</span>
          </span>
        </header>
      )}
      {!embedded && (
        <p className="ss-context">
          {file.coverage === "partial"
            ? "Diff context only. Unchanged sections are omitted; — means no value is present in this hunk."
            : `Complete ${file.status === "removed" ? "removed" : "new"} scene from the patch.`}
        </p>
      )}
      {file.diagnostics.length > 0 && (
        <div className="ss-notes">
          {file.diagnostics.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      {file.pending && file.reviewUrl && (
        <LinkButton className="ss-button" href={file.reviewUrl}>
          Load original scene diff <ArrowUpRight size={14} />
        </LinkButton>
      )}
      {changes.map((change) => (
        <ChangedSection
          key={change.id}
          change={change}
          reviewUrl={file.reviewUrl}
          compact={embedded}
        />
      ))}
      {!changes.length && !file.pending && (
        <p className="ss-empty">
          {file.changes.length
            ? "No changes match these filters."
            : embedded
              ? "No structured changes found. Select Original diff to inspect this file."
              : "No structured changes found. Inspect the original diff below."}
        </p>
      )}
      {!file.pending && !embedded && (
        <details className="ss-raw">
          <summary>
            Original diff <span>{file.additions + file.deletions} changed lines</span>
          </summary>
          <pre>{file.rawDiff}</pre>
        </details>
      )}
    </article>
  );
}
export function InlineViewSwitch({
  filePath,
  original,
  onOriginal,
}: {
  filePath: string;
  original: boolean;
  onOriginal: (original: boolean) => void;
}) {
  return (
    <fieldset className="ss ss-view-switch" aria-label={`Diff view for ${filePath}`}>
      <Button
        className="ss-filter"
        variant="ghost"
        aria-pressed={!original}
        onPress={() => onOriginal(false)}
      >
        Scene
      </Button>
      <Button
        className="ss-filter"
        variant="ghost"
        aria-pressed={original}
        onPress={() => onOriginal(true)}
      >
        Original diff
      </Button>
    </fieldset>
  );
}
export function InlineSceneReview({ file, original }: { file: SceneReview; original: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const contents = inlineFileContents(file);
  if (original) return null;
  return (
    <section className="ss ss-inline" aria-label={`SceneSleuth review for ${file.filePath}`}>
      <div className="ss-toolbar">
        <div className="ss-filters" aria-label="Filter scene changes">
          {Object.entries(kindGroups).map(([key, label]) => (
            <Button
              key={key}
              className="ss-filter"
              variant="ghost"
              aria-pressed={filter === key}
              onPress={() => setFilter(key as Filter)}
            >
              {key === "resource" ? "Embedded resources" : label}
            </Button>
          ))}
        </div>
        <label className="ss-search">
          <Search size={14} />
          <span className="ss-sr-only">Search nodes and properties</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search scene…"
          />
        </label>
      </div>
      <div className="ss-files">
        {!contents.changes.length && file.changes.length ? (
          <p className="ss-empty">
            No scene-local changes in this file. Select Original diff to inspect its file
            references.
          </p>
        ) : (
          <FileReview file={contents} filter={filter} search={search} embedded />
        )}
      </div>
    </section>
  );
}
export function Inspector({
  snapshot,
  onClose,
  onRefresh,
}: {
  snapshot: ReviewSnapshot;
  onClose?: () => void;
  onRefresh?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const stats = sceneStats(snapshot.files);
  return (
    <section className="ss ss-inspector" aria-label="SceneSleuth scene review">
      <header className="ss-header">
        <div className="ss-brand">
          <span className="ss-logo">
            <GitBranch size={19} />
          </span>
          <div>
            <strong>SceneSleuth</strong>
            <p>See the scene behind the diff.</p>
          </div>
        </div>
        <div className="ss-actions">
          {onRefresh && (
            <Button
              className="ss-icon-button"
              variant="ghost"
              onPress={onRefresh}
              aria-label="Refresh scene changes"
              isDisabled={snapshot.status === "loading"}
            >
              <RefreshCw size={16} />
            </Button>
          )}
          {onClose && (
            <Button
              className="ss-icon-button"
              variant="ghost"
              onPress={onClose}
              aria-label="Close scene review"
            >
              <X size={18} />
            </Button>
          )}
        </div>
      </header>
      <div className="ss-review-title">
        <span className="ss-eyebrow">GODOT SCENE REVIEW</span>
        <p>{snapshot.title}</p>
      </div>
      {snapshot.status === "loading" && (
        <output className="ss-empty">Reading scene changes…</output>
      )}
      {snapshot.status === "error" && (
        <div className="ss-empty" role="alert">
          <h2>Couldn’t read this review</h2>
          <p>{snapshot.error}</p>
          {snapshot.changesUrl && (
            <LinkButton className="ss-button" href={snapshot.changesUrl}>
              Open Files changed
            </LinkButton>
          )}
          {onRefresh && (
            <Button className="ss-button" onPress={onRefresh}>
              Try again
            </Button>
          )}
        </div>
      )}
      {snapshot.status === "ready" &&
        (snapshot.files.length ? (
          <>
            <div className="ss-stats">
              <span>
                <strong>{snapshot.files.length}</strong>{" "}
                {snapshot.files.length === 1 ? "scene" : "scenes"}
              </span>
              <span>
                <strong>{stats.nodes}</strong> nodes
              </span>
              <span>
                <strong>{stats.resources}</strong> resources
              </span>
              <span>
                <strong>{stats.signals}</strong> signals
              </span>
            </div>
            <div className="ss-toolbar">
              <div className="ss-filters" aria-label="Filter scene changes">
                {Object.entries(kindGroups).map(([key, label]) => (
                  <Button
                    key={key}
                    className="ss-filter"
                    variant="ghost"
                    onPress={() => setFilter(key as Filter)}
                    aria-pressed={filter === key}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <label className="ss-search">
                <Search size={14} />
                <span className="ss-sr-only">Search nodes and properties</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find a node, property, or resource…"
                />
              </label>
            </div>
            <div className="ss-files">
              {snapshot.files.map((file) => (
                <FileReview key={file.filePath} file={file} filter={filter} search={search} />
              ))}
            </div>
          </>
        ) : (
          <div className="ss-empty">
            <Layers size={28} />
            <h2>No Godot scenes changed</h2>
            <p>This pull request has no .tscn file changes.</p>
          </div>
        ))}
      <footer className="ss-footer">
        <span>Read-only review · Original GitHub diff is unchanged</span>
        <a
          href="https://docs.godotengine.org/en/stable/engine_details/file_formats/tscn.html"
          target="_blank"
          rel="noreferrer"
        >
          TSCN reference <ArrowUpRight size={12} />
        </a>
      </footer>
    </section>
  );
}
