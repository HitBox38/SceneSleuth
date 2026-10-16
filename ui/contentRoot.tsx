import { createRoot } from "react-dom/client";
import { GitBranch } from "lucide-react";
import { Button } from "../popup/src/components/ui/button.tsx";
import { Inspector } from "./SceneReview.tsx";
import styles from "./review.css?inline";
import type { ReviewSnapshot } from "../shared/model.ts";
export function createInspector(refresh: () => void) {
  const host = document.createElement("div");
  host.id = "scenesleuth-root";
  host.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:2147483000;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `:host{all:initial}${styles}`;
  const target = document.createElement("div");
  shadow.append(style, target);
  document.body.append(host);
  const root = createRoot(target);
  let current: ReviewSnapshot;
  let opened = false;
  function render() {
    root.render(
      opened ? (
        <div className="ss-panel">
          <Inspector
            key={current.reviewKey}
            snapshot={current}
            onClose={() => {
              opened = false;
              render();
            }}
            onRefresh={refresh}
          />
        </div>
      ) : (
        <div className="ss">
          <Button
            className="ss-launcher"
            onPress={() => {
              opened = true;
              render();
            }}
          >
            <GitBranch size={17} /> SceneSleuth{" "}
            <span>
              {current.status === "loading"
                ? "…"
                : current.files.length
                  ? `${current.files.length} scenes`
                  : "Review"}
            </span>
          </Button>
        </div>
      ),
    );
  }
  return {
    update(snapshot: ReviewSnapshot) {
      current = snapshot;
      render();
    },
    open() {
      if (current) {
        opened = true;
        render();
      }
    },
    dispose() {
      root.unmount();
      host.remove();
    },
  };
}
