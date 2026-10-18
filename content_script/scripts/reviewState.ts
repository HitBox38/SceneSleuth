import type { SceneReview, ReferenceNavigation } from "../../shared/model.ts";
import type { GithubLoadSource } from "./githubReview.ts";

export interface GithubReviewData {
  comparisonKey: string;
  files: SceneReview[];
  navigation?: ReferenceNavigation;
  partialListing?: boolean;
  loadSource?: GithubLoadSource;
}

// One route/comparison owns this state. Virtualized table removals must not
// discard loaded values, the known file listing, or side-specific GUID evidence.
export function createReviewState() {
  let comparisonKey: string | undefined;
  const files = new Map<string, SceneReview>();
  let navigation: ReferenceNavigation | undefined;
  let loadSource: GithubLoadSource | undefined;
  let completeListing = false;
  function clear() {
    comparisonKey = undefined;
    files.clear();
    navigation = undefined;
    loadSource = undefined;
    completeListing = false;
  }
  return {
    clear,
    get current(): GithubReviewData | undefined {
      return comparisonKey === undefined
        ? undefined
        : {
            comparisonKey,
            files: [...files.values()],
            navigation,
            partialListing: !completeListing,
            loadSource,
          };
    },
    merge(data: GithubReviewData): GithubReviewData {
      const nextKey = data.partialListing && completeListing ? comparisonKey! : data.comparisonKey;
      if (comparisonKey !== nextKey) {
        clear();
        comparisonKey = nextKey;
      }
      completeListing ||= !data.partialListing;
      loadSource = data.loadSource ?? loadSource;
      for (const file of data.files) {
        const previous = files.get(file.filePath);
        if (previous?.coverage === "complete" && file.coverage === "partial") continue;
        if (
          !previous ||
          previous.pending ||
          (!file.pending && file.rawDiff.length >= previous.rawDiff.length)
        )
          files.set(file.filePath, file);
      }
      if (data.navigation) {
        const targets = new Map(navigation?.files.map((file) => [file.path, file]));
        for (const target of data.navigation.files)
          targets.set(target.path, {
            ...targets.get(target.path),
            path: target.path,
            status: target.status,
            ...Object.fromEntries(
              Object.entries(target).filter(([, value]) => value !== undefined),
            ),
          });
        navigation = {
          ...data.navigation,
          beforeRevision: data.navigation.beforeRevision ?? navigation?.beforeRevision,
          afterRevision: data.navigation.afterRevision ?? navigation?.afterRevision,
          files: [...targets.values()],
        };
      }
      return {
        comparisonKey: comparisonKey!,
        files: [...files.values()],
        navigation,
        partialListing: !completeListing,
        loadSource,
      };
    },
  };
}
