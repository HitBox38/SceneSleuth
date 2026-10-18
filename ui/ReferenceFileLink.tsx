import { useContext, useEffect, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipTriggerStateContext } from "react-aria-components";
import { LinkButton } from "../popup/src/components/ui/button.tsx";
import previewStyles from "./imagePreview.css?inline";
import { EngineThemeContext } from "./EngineTheme.ts";

function ImagePreview({
  src,
  label,
  path,
  expression,
}: {
  src: string;
  label: string;
  path: string;
  expression: string;
}) {
  const [image, setImage] = useState<
    { status: "loading" | "error" } | { status: "loaded"; width: number; height: number }
  >({ status: "loading" });
  useEffect(() => {
    if (image.status !== "loading") return;
    const timeout = window.setTimeout(() => setImage({ status: "error" }), 10000);
    return () => window.clearTimeout(timeout);
  }, [image.status]);
  return (
    <>
      <strong className="ss-image-preview-name">{label}</strong>
      <div className="ss-image-preview-stage">
        {image.status !== "error" && (
          <img
            src={src}
            alt={`Preview of ${label}`}
            referrerPolicy="no-referrer"
            style={{ visibility: image.status === "loaded" ? "visible" : "hidden" }}
            onLoad={(event) =>
              setImage({
                status: "loaded",
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            onError={() => setImage({ status: "error" })}
          />
        )}
        {image.status === "loading" && (
          <span className="ss-image-preview-message">Loading preview…</span>
        )}
        {image.status === "error" && (
          <span className="ss-image-preview-message">
            Preview unavailable. Click the filename to open the file.
          </span>
        )}
      </div>
      <span className="ss-image-preview-path">{path}</span>
      <span className="ss-image-preview-path">{expression}</span>
      {image.status === "loaded" && (
        <span className="ss-image-preview-size">
          {image.width} × {image.height}
        </span>
      )}
    </>
  );
}

interface ReferenceFileLinkProps {
  href: string;
  inReview: boolean;
  label: string;
  side: "before" | "after";
  title: string;
  imageSrc?: string;
  path: string;
}

function ReferenceAnchor({
  href,
  inReview,
  label,
  side,
}: Pick<ReferenceFileLinkProps, "href" | "inReview" | "label" | "side">) {
  const tooltip = useContext(TooltipTriggerStateContext);
  return (
    <LinkButton
      className="ss-reference ss-reference-link"
      variant="link"
      href={href}
      data-scenesleuth-file-reference={inReview ? "diff" : "repository"}
      aria-label={`${label} — ${side} — ${inReview ? "jump to PR diff" : "open repository file"}`}
      // Enter/leave synthesis can miss a shadow-root boundary. Bubbling pointer
      // events keep hover working while React Aria owns delay, focus, and dismissal.
      onPointerOver={(event) => {
        if (event.pointerType !== "touch") tooltip?.open();
      }}
      onPointerOut={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          tooltip?.close();
      }}
    >
      {label}
    </LinkButton>
  );
}

export function ReferenceFileLink({
  href,
  inReview,
  label,
  side,
  title,
  imageSrc,
  path,
}: ReferenceFileLinkProps) {
  const theme = useContext(EngineThemeContext);
  const link = <ReferenceAnchor href={href} inReview={inReview} label={label} side={side} />;
  if (!imageSrc) return <span title={title}>{link}</span>;
  return (
    <TooltipTrigger delay={350} closeDelay={120}>
      {link}
      <Tooltip
        className="ss-image-preview"
        data-ss-engine={theme}
        placement="top"
        offset={8}
        containerPadding={12}
        style={{ zIndex: 2147483647 }}
      >
        {/* The overlay lives outside the review's shadow root to avoid clipped values.
          Its small, trusted stylesheet travels with it and is removed on close. */}
        <style>{previewStyles}</style>
        <ImagePreview
          key={imageSrc}
          src={imageSrc}
          label={label}
          path={path}
          expression={title.split("\n").at(-1) ?? ""}
        />
      </Tooltip>
    </TooltipTrigger>
  );
}
