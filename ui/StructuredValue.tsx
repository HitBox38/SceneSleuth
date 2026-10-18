import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  structuredValue,
  type StructuredValue as Value,
  type ValueSlice,
} from "./structuredValues.ts";

function ValueTree({
  value,
  renderLiteral,
}: {
  value: Value;
  renderLiteral: (slice: ValueSlice, keyLabel?: string) => ReactNode;
}) {
  if (!value.entries) return <span className="ss-tree-literal">{renderLiteral(value)}</span>;
  const count = value.entries.length;
  const name =
    value.kind === "object" ? value.label : value.kind === "array" ? "Array" : "Dictionary";
  const unit = value.kind === "array" ? "item" : "field";
  return (
    <details className="ss-value-tree">
      <summary>
        <ChevronDown className="ss-chevron" size={11} aria-hidden="true" />
        <span>{name}</span>
        <small>
          · {count} {unit}
          {count === 1 ? "" : "s"}
        </small>
      </summary>
      <div className="ss-tree-entries">
        {value.entries.map((entry, index) => (
          <div className="ss-tree-entry" key={index}>
            <span className="ss-tree-key" title={entry.label}>
              {entry.key ? renderLiteral(entry.key, entry.label) : entry.label}
            </span>
            <ValueTree value={entry.value} renderLiteral={renderLiteral} />
          </div>
        ))}
        {count === 0 && <span className="ss-tree-empty">Empty {name?.toLowerCase()}</span>}
      </div>
    </details>
  );
}

export function StructuredValue({
  raw,
  renderLiteral,
}: {
  raw: string;
  renderLiteral: (slice: ValueSlice, keyLabel?: string) => ReactNode;
}) {
  const value = structuredValue(raw);
  if (!value) return renderLiteral({ start: 0, end: raw.length });
  return (
    <div className="ss-structured-value">
      <ValueTree value={value} renderLiteral={renderLiteral} />
      <details className="ss-value-source">
        <summary>Serialized value</summary>
        <code>{raw}</code>
      </details>
    </div>
  );
}
