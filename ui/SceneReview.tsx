import { useState } from "react";
import {
  Search,
  GitBranch,
  Layers,
  ArrowUpRight,
  RefreshCw,
  X,
  ChevronDown,
  Box,
  Diamond,
  Zap,
  FileBox,
  CircleHelp,
  Camera,
  Image,
  Lightbulb,
  PersonStanding,
  Scan,
  Shapes,
  Navigation,
  Volume2,
  PanelTop,
  MousePointer2,
  Type,
  Settings2,
} from "lucide-react";
import { Button } from "../popup/src/components/ui/button.tsx";
import { LinkButton } from "../popup/src/components/ui/button.tsx";
import type {
  ReviewSnapshot,
  SceneReview,
  SectionChange,
  SectionKind,
  ValueReference,
  ReferenceNavigation,
  PropertyChange,
} from "../shared/model.ts";
import { inlineFileContents } from "./fileContents.ts";
import {
  referenceLink,
  referenceImageSource,
  referenceFilePath,
} from "../shared/referenceLinks.ts";
import { ReferenceFileLink } from "./ReferenceFileLink.tsx";
import { inspectorValue, propertyGroups, propertyLabel } from "./propertyPresentation.ts";
import { reviewFileKind, reviewEngine, reviewEngines } from "../shared/fileTypes.ts";
import { StructuredValue } from "./StructuredValue.tsx";
import { unityInspectorValue } from "./unityPresentation.ts";

const labels: Record<SectionKind, string> = {
  node: "Node",
  gameobject: "GameObject",
  component: "Component",
  unity_object: "Unity object",
  ext_resource: "External resource",
  sub_resource: "Resource",
  resource_header: "Resource file",
  resource: "Resource",
  connection: "Signal",
  scene: "Scene",
  project: "Settings",
  unknown: "Unresolved",
};
const kindIcons = {
  node: Box,
  gameobject: Box,
  component: Shapes,
  unity_object: Diamond,
  ext_resource: Diamond,
  sub_resource: Diamond,
  resource_header: FileBox,
  resource: Diamond,
  connection: Zap,
  scene: FileBox,
  project: Settings2,
  unknown: CircleHelp,
};
const nodeIcons = {
  camera: Camera,
  sprite: Image,
  light: Lightbulb,
  character: PersonStanding,
  area: Scan,
  collision: Shapes,
  navigation: Navigation,
  audio: Volume2,
  button: MousePointer2,
  text: Type,
  control: PanelTop,
  node: Box,
};
function nodeIconKey(type: string): keyof typeof nodeIcons {
  if (/^Camera[23]D$/.test(type)) return "camera";
  if (/^(?:AnimatedSprite|Sprite)[23]D$/.test(type)) return "sprite";
  if (/Light[23]D$/.test(type)) return "light";
  if (/^CharacterBody[23]D$/.test(type)) return "character";
  if (/^Area[23]D$/.test(type)) return "area";
  if (/^Collision(?:Shape|Polygon)[23]D$/.test(type)) return "collision";
  if (/^Navigation(?:Agent|Region|Link)[23]D$/.test(type)) return "navigation";
  if (/^AudioStreamPlayer(?:[23]D)?$/.test(type)) return "audio";
  if (type.endsWith("Button")) return "button";
  if (/^(?:Label|RichTextLabel|LineEdit|TextEdit)$/.test(type)) return "text";
  if (
    /^(?:Control|Panel|PanelContainer|TextureRect|ColorRect)$/.test(type) ||
    type.endsWith("Container")
  )
    return "control";
  return "node";
}
const kindGroups = {
  all: "All changes",
  node: "Nodes",
  resource: "Resources",
  connection: "Signals",
  project: "Project settings",
  gameobject: "GameObjects",
  component: "Components",
  unity_object: "Other objects",
} as const;
type Filter = keyof typeof kindGroups;
function matchesKind(change: SectionChange, filter: Filter) {
  return (
    filter === "all" ||
    (filter === "resource"
      ? ["ext_resource", "sub_resource", "resource"].includes(change.kind)
      : change.kind === filter)
  );
}
export function sceneStats(files: SceneReview[]) {
  const changes = files.flatMap((file) => file.changes);
  return {
    nodes: changes.filter((item) => item.kind === "node").length,
    resources: changes.filter((item) =>
      ["ext_resource", "sub_resource", "resource"].includes(item.kind),
    ).length,
    signals: changes.filter((item) => item.kind === "connection").length,
    properties: changes.reduce((sum, item) => sum + item.properties.length, 0),
    settings: files
      .filter((file) => reviewFileKind(file) === "project")
      .reduce(
        (sum, file) =>
          sum + file.changes.reduce((count, change) => count + change.properties.length, 0),
        0,
      ),
    gameObjects: changes.filter((item) => item.kind === "gameobject").length,
    components: changes.filter((item) => item.kind === "component").length,
    unityObjects: changes.filter((item) => item.kind === "unity_object").length,
  };
}
function LiteralValue({
  raw,
  references,
  file,
  side,
  navigation,
  compact = false,
}: {
  raw?: string;
  references?: ValueReference[];
  file: SceneReview;
  side: "before" | "after";
  navigation?: ReferenceNavigation;
  compact?: boolean;
  incomplete?: boolean;
}) {
  if (raw === undefined) return "—";
  if (!references?.length) {
    const value = compact
      ? reviewEngine(file) === "unity"
        ? unityInspectorValue(raw)
        : inspectorValue(raw)
      : undefined;
    if (!value) return raw;
    return (
      <span className={`ss-inspector-value ss-value-${value.kind}`} title={raw}>
        <span className="ss-sr-only">{raw}</span>
        {value.swatch && (
          <span className="ss-color-swatch" aria-hidden="true">
            <span style={{ backgroundColor: value.swatch }} />
          </span>
        )}
        <span className="ss-components" aria-hidden="true">
          {value.components.map(({ label, value: component }) => (
            <span className="ss-component" key={label}>
              <span className="ss-axis" data-axis={label}>
                {label}
              </span>
              <span>{component}</span>
            </span>
          ))}
        </span>
      </span>
    );
  }
  return (
    <>
      {references.map((reference, index) => {
        const link = referenceLink(reference, file, side, navigation);
        const imageSrc = referenceImageSource(reference, file, side, navigation);
        const unityPath =
          reference.unityGuid && navigation
            ? referenceFilePath(reference, file, side, navigation)
            : undefined;
        const label = reference.unityGuid
          ? unityPath?.split("/").pop() || raw.slice(reference.start, reference.end)
          : reference.label;
        const title = `${reference.className ? reference.className + " · " : ""}${reference.target}\n${raw.slice(reference.start, reference.end)}`;
        return (
          <span key={reference.start}>
            {raw.slice(index ? references[index - 1].end : 0, reference.start)}
            {link ? (
              <ReferenceFileLink
                href={link.href}
                inReview={link.inReview}
                label={label}
                side={side}
                title={`${link.inReview ? "Jump to PR diff" : "Open repository file"}\n${title}`}
                imageSrc={imageSrc}
                path={unityPath || reference.target}
              />
            ) : (
              <span className="ss-reference" title={title}>
                {label}
              </span>
            )}
          </span>
        );
      })}
      {raw.slice(references[references.length - 1].end)}
    </>
  );
}
function ReferenceValue(props: Parameters<typeof LiteralValue>[0]) {
  if (props.raw === undefined) return "—";
  const raw = props.raw;
  const unity = reviewEngine(props.file) === "unity";
  if (props.incomplete || (unity && unityInspectorValue(raw))) return <LiteralValue {...props} />;
  return (
    <StructuredValue
      raw={raw}
      unity={unity}
      renderLiteral={({ start, end }, keyLabel) => {
        const references = props.references
          ?.filter((reference) => reference.start >= start && reference.end <= end)
          .map((reference) => ({
            ...reference,
            start: reference.start - start,
            end: reference.end - start,
          }));
        if (keyLabel !== undefined && !references?.length) return keyLabel;
        return <LiteralValue {...props} raw={raw.slice(start, end)} references={references} />;
      }}
    />
  );
}
function SourceLinks({ change, reviewUrl }: { change: SectionChange; reviewUrl?: string }) {
  return (
    <span className="ss-source-links">
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
  );
}
function PropertyRows({
  properties,
  compact,
  file,
  navigation,
}: {
  properties: PropertyChange[];
  compact: boolean;
  file: SceneReview;
  navigation?: ReferenceNavigation;
}) {
  return properties.map((property, index) => (
    <div className={`ss-property ss-${property.operation}`} key={`${property.name}:${index}`}>
      <span className="ss-property-name" title={property.name}>
        <span>
          {compact
            ? propertyLabel(property.name, reviewEngine(file) === "unity")
            : property.name.replace(/^@/, "")}
        </span>
        <small title={property.operation}>
          {compact ? (
            <>
              <span className="ss-sr-only">{property.operation}</span>
              <span aria-hidden="true">
                {property.operation === "added"
                  ? "+"
                  : property.operation === "removed"
                    ? "−"
                    : "~"}
              </span>
            </>
          ) : (
            property.operation
          )}
          {(property.newLine ?? property.oldLine) &&
            (compact && file.reviewUrl ? (
              <a
                href={
                  file.reviewUrl
                    ? `${file.reviewUrl}${property.newLine ? "R" : "L"}${property.newLine ?? property.oldLine}`
                    : undefined
                }
                aria-label={`${property.newLine ? "After" : "Before"} line ${property.newLine ?? property.oldLine}`}
              >
                {` L${property.newLine ?? property.oldLine}`}
              </a>
            ) : (
              ` · L${property.newLine ?? property.oldLine}`
            ))}
        </small>
      </span>
      {(["before", "after"] as const).map((side) => (
        <div
          key={side}
          className={`ss-value-cell ss-${side}`}
          data-empty={property[side] === undefined}
        >
          <span className="ss-sr-only">{side === "before" ? "Before: " : "After: "}</span>
          <ReferenceValue
            raw={property[side]}
            references={property[`${side}References`]}
            file={file}
            side={side}
            navigation={navigation}
            compact={compact}
            incomplete={property[`${side}Incomplete`]}
          />
        </div>
      ))}
    </div>
  ));
}
function ChangedSection({
  change,
  reviewUrl,
  compact = false,
  file,
  navigation,
}: {
  change: SectionChange;
  reviewUrl?: string;
  compact?: boolean;
  file: SceneReview;
  navigation?: ReferenceNavigation;
}) {
  const KindIcon =
    change.kind === "node" ? nodeIcons[nodeIconKey(change.className)] : kindIcons[change.kind];
  const groups = compact ? propertyGroups(change) : [];
  const nodeFamily =
    change.kind !== "node"
      ? undefined
      : change.className.includes("3D")
        ? "3d"
        : /(?:Control|Button|Label|Container|Panel|ProgressBar|LineEdit|TextEdit|TextureRect|ColorRect)$/.test(
              change.className,
            )
          ? "control"
          : "2d";
  const path = compact
    ? change.path && change.path !== "." && change.path !== change.label
      ? change.path
      : undefined
    : change.path || labels[change.kind];
  return (
    <details
      className="ss-section"
      open={
        change.kind === "node" ||
        change.kind === "unknown" ||
        change.kind === "project" ||
        change.kind === "resource" ||
        change.kind === "gameobject" ||
        change.kind === "component" ||
        change.kind === "unity_object"
      }
    >
      <summary>
        <ChevronDown className="ss-chevron" size={12} aria-hidden="true" />
        <KindIcon
          className={`ss-kind-icon ss-kind-${change.kind}`}
          data-node-family={nodeFamily}
          size={14}
          aria-hidden="true"
        />
        <span className="ss-section-name">
          {change.kind === "project" ? propertyLabel(change.label) : change.label}
          {path && <span className="ss-section-path">{path}</span>}
        </span>
        <span className="ss-type" title={change.className || labels[change.kind]}>
          {change.className || labels[change.kind]}
        </span>
        {compact && <SourceLinks change={change} reviewUrl={reviewUrl} />}
        <span className={`ss-operation ss-${change.operation}`} aria-label={change.operation}>
          {change.operation === "added" ? "+" : change.operation === "removed" ? "−" : "~"}
        </span>
      </summary>
      {!compact && (
        <div className="ss-section-meta">
          <span>
            {labels[change.kind]} · {change.operation}
          </span>
          <SourceLinks change={change} reviewUrl={reviewUrl} />
        </div>
      )}
      {change.properties.length > 0 ? (
        <div className="ss-properties">
          {!compact && (
            <div className="ss-property ss-property-head">
              <span>Property</span>
              <span>Before</span>
              <span>After</span>
            </div>
          )}
          {compact ? (
            groups.map((group) =>
              group.label === "Properties" && groups.length === 1 ? (
                <PropertyRows
                  key={group.label}
                  properties={group.properties}
                  compact
                  file={file}
                  navigation={navigation}
                />
              ) : (
                <details className="ss-property-group" key={group.label} open>
                  <summary>
                    <ChevronDown className="ss-chevron" size={10} aria-hidden="true" />
                    {group.label}
                  </summary>
                  <PropertyRows
                    properties={group.properties}
                    compact
                    file={file}
                    navigation={navigation}
                  />
                </details>
              ),
            )
          ) : (
            <PropertyRows
              properties={change.properties}
              compact={false}
              file={file}
              navigation={navigation}
            />
          )}
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
  navigation,
}: {
  file: SceneReview;
  filter: Filter;
  search: string;
  embedded?: boolean;
  navigation?: ReferenceNavigation;
}) {
  const project = reviewFileKind(file) === "project";
  const resource = reviewFileKind(file) === "resource";
  const unity = reviewEngine(file) === "unity";
  const subject = unity
    ? `Unity ${reviewFileKind(file).slice(6)}`
    : project
      ? "project settings"
      : resource
        ? "resource"
        : "scene";
  const changes = file.changes.filter(
    (change) =>
      matchesKind(change, filter) &&
      (!search ||
        `${change.label} ${change.path} ${change.className} ${change.properties
          .map(
            (p) =>
              `${p.name} ${propertyLabel(p.name, unity)} ${p.before ?? ""} ${p.after ?? ""} ${(["before", "after"] as const).flatMap((side) => (p[`${side}References`] ?? []).map((reference) => `${reference.label} ${reference.target} ${navigation ? (referenceFilePath(reference, file, side, navigation) ?? "") : ""}`)).join(" ")}`,
          )
          .join(" ")}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <article
      className="ss-file"
      aria-label={
        embedded
          ? `${file.coverage === "partial" ? `Partial ${subject}` : subject[0].toUpperCase() + subject.slice(1)} diff for ${file.filePath}`
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
            : `Complete ${file.status === "removed" ? "removed" : "new"} ${project ? "project configuration" : resource ? "resource" : "scene"} from the patch.`}
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
          Load original {subject} diff <ArrowUpRight size={14} />
        </LinkButton>
      )}
      {embedded && changes.length > 0 && (
        <div className="ss-property ss-property-head ss-column-head" aria-hidden="true">
          <span>Property</span>
          <span>Before</span>
          <span>After</span>
        </div>
      )}
      {changes.map((change) => (
        <ChangedSection
          key={change.id}
          change={change}
          reviewUrl={file.reviewUrl}
          compact={embedded}
          file={file}
          navigation={navigation}
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
  viewLabel = "Scene",
  original,
  onOriginal,
}: {
  filePath: string;
  viewLabel?: string;
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
        {viewLabel}
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
export function InlineSceneReview({
  file,
  original,
  navigation,
}: {
  file: SceneReview;
  original: boolean;
  navigation?: ReferenceNavigation;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const contents = inlineFileContents(file);
  const project = reviewFileKind(file) === "project";
  const resource = reviewFileKind(file) === "resource";
  const unity = reviewEngine(file) === "unity";
  if (original) return null;
  return (
    <section className="ss ss-inline" aria-label={`SceneSleuth review for ${file.filePath}`}>
      <div className="ss-toolbar">
        {!project &&
          !resource &&
          (!unity || ["unity_scene", "unity_prefab"].includes(reviewFileKind(file))) && (
            <div className="ss-filters" aria-label="Filter scene changes">
              {Object.entries(kindGroups)
                .filter(([key]) =>
                  unity
                    ? ["all", "gameobject", "component", "unity_object"].includes(key)
                    : !["project", "gameobject", "component", "unity_object"].includes(key),
                )
                .map(([key, label]) => (
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
          )}
        <label className="ss-search">
          <Search size={14} />
          <span className="ss-sr-only">
            {unity
              ? "Search Unity objects and properties"
              : project
                ? "Search project settings"
                : resource
                  ? "Search resources and properties"
                  : "Search nodes and properties"}
          </span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              unity
                ? "Search Unity…"
                : project
                  ? "Search project settings…"
                  : resource
                    ? "Search resource…"
                    : "Search scene…"
            }
          />
        </label>
      </div>
      <div className="ss-files">
        {!contents.changes.length && file.changes.length ? (
          <p className="ss-empty">
            No local changes in this file. Select Original diff to inspect its file references.
          </p>
        ) : (
          <FileReview
            file={contents}
            filter={filter}
            search={search}
            navigation={navigation}
            embedded
          />
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
  const hasScenes = snapshot.files.some((file) => reviewFileKind(file) === "scene");
  const hasResources = snapshot.files.some(
    (file) => reviewEngine(file) === "godot" && reviewFileKind(file) !== "project",
  );
  const hasUnity = snapshot.files.some((file) => reviewEngine(file) === "unity");
  const engines = reviewEngines(snapshot.files);
  return (
    <section className="ss ss-inspector" aria-label={`SceneSleuth ${engines} review`}>
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
        <span className="ss-eyebrow">{engines.toUpperCase()} REVIEW</span>
        <p>{snapshot.title}</p>
      </div>
      {snapshot.status === "loading" && (
        <output className="ss-empty">Reading scene and asset changes…</output>
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
                {snapshot.files.length === 1 ? "file" : "files"}
              </span>
              {hasScenes && (
                <span>
                  <strong>{stats.nodes}</strong> nodes
                </span>
              )}
              {hasResources && (
                <span>
                  <strong>{stats.resources}</strong> resources
                </span>
              )}
              {hasScenes && (
                <span>
                  <strong>{stats.signals}</strong> signals
                </span>
              )}
              {hasUnity && (
                <>
                  <span>
                    <strong>{stats.gameObjects}</strong> GameObjects
                  </span>
                  <span>
                    <strong>{stats.components}</strong> components
                  </span>
                  <span>
                    <strong>{stats.unityObjects}</strong> other objects
                  </span>
                </>
              )}
              {snapshot.files.some((file) => reviewFileKind(file) === "project") && (
                <span>
                  <strong>{stats.settings}</strong> settings
                </span>
              )}
            </div>
            <div className="ss-toolbar">
              <div className="ss-filters" aria-label="Filter scene changes">
                {Object.entries(kindGroups)
                  .filter(
                    ([key]) =>
                      hasUnity || !["gameobject", "component", "unity_object"].includes(key),
                  )
                  .map(([key, label]) => (
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
                <FileReview
                  key={file.filePath}
                  file={file}
                  filter={filter}
                  search={search}
                  navigation={snapshot.navigation}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="ss-empty">
            <Layers size={28} />
            <h2>No supported files changed</h2>
            <p>This pull request has no supported Godot or Unity file changes.</p>
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
