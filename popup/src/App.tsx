import { useEffect, useState } from "react";
import "./App.css";
import { Loader2 } from "lucide-react";

interface DiffLine {
  lineNumber: number | null;
  content: string;
  type: "addition" | "deletion";
}

interface FileDiff {
  fileName: string;
  filePath: string;
  changes: DiffLine[];
  stats: {
    additions: number;
    deletions: number;
  };
}

type DiffMessage =
  | { action: "NEW_DIFF"; payload: FileDiff }
  | { action: "ALL_DIFFS"; payload: FileDiff[] };

function App() {
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const requestDiffs = () => {
      // Request current diffs from content script
      if (typeof browser !== "undefined") {
        // Firefox
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs[0]?.id) {
            browser.tabs
              .sendMessage(tabs[0].id, { action: "GET_DIFFS" })
              .then((response) => {
                if (response && response.diffs) {
                  setDiffs(response.diffs);
                  setLoading(false);
                }
              })
              .catch((err) => console.error("Error getting diffs:", err));
          }
        });
      } else {
        // Chrome
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "GET_DIFFS" }, (response) => {
              if (response && response.diffs) {
                setDiffs(response.diffs);
                setLoading(false);
              }
            });
          }
        });
      }
    };

    // Request diffs when popup opens
    requestDiffs();

    // Set up listener for incoming messages
    const messageListener = (message: DiffMessage) => {
      if (message.action === "NEW_DIFF") {
        setDiffs((prev) => [
          ...prev.filter((d) => d.filePath !== message.payload.filePath),
          message.payload,
        ]);
        setLoading(false);
      } else if (message.action === "ALL_DIFFS") {
        setDiffs(message.payload);
        setLoading(false);
      }
    };

    // Setup the message listener based on browser
    if (typeof browser !== "undefined") {
      // Firefox
      browser.runtime.onMessage.addListener(messageListener);
    } else {
      // Chrome
      chrome.runtime.onMessage.addListener(messageListener);
    }

    // Cleanup listener when component unmounts
    return () => {
      if (typeof browser !== "undefined") {
        browser.runtime.onMessage.removeListener(messageListener);
      } else {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []);

  return (
    <>
      <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
        SceneSleuth
      </h1>
      {loading ? (
        <Loader2 className="h-8 w-8 animate-spin" />
      ) : (
        <div className="flex flex-col gap-4">
          <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">Changes:</h3>
          {diffs.map((diff, index) => (
            <div key={index} className="flex flex-col gap-2 border p-2">
              <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">{diff.fileName}</h4>
              <p className="text-xl text-muted-foreground">Additions: {diff.stats.additions}</p>
              <p className="text-xl text-muted-foreground">Deletions: {diff.stats.deletions}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default App;
