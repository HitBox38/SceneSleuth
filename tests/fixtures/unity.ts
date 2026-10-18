import { reviewDiff } from "../../content_script/scripts/diffParser.ts";

export const scriptGuid = "a123456789abcdef0123456789abcdef";
export const imageGuid = "b123456789abcdef0123456789abcdef";
export const prefabGuid = "c123456789abcdef0123456789abcdef";
export const unityPath = "Assets/Scenes/Arena.unity";
export const unitySource = [
  "%YAML 1.1",
  "%TAG !u! tag:unity3d.com,2011:",
  "--- !u!1 &9223372036854775801",
  "GameObject:",
  "  m_Name: Player",
  "  m_IsActive: 1",
  "  m_Component:",
  "  - component: {fileID: 200}",
  "  - component: {fileID: 300}",
  "  - component: {fileID: 400}",
  "--- !u!4 &200",
  "Transform:",
  "  m_GameObject: {fileID: 9223372036854775801}",
  "  m_LocalPosition: {x: 1.5, y: -2, z: 0}",
  "  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}",
  "  m_LocalScale: {x: 1, y: 1, z: 1}",
  "  m_Father: {fileID: 0}",
  "--- !u!114 &300",
  "MonoBehaviour:",
  "  m_GameObject: {fileID: 9223372036854775801}",
  `  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}`,
  "  health: 100",
  "  inventory:",
  "  - name: Coin",
  "    amount: 3",
  "--- !u!212 &400",
  "SpriteRenderer:",
  "  m_GameObject: {fileID: 9223372036854775801}",
  `  m_Sprite: {fileID: 21300000, guid: ${imageGuid}, type: 3}`,
  "  m_Color: {r: 0.5, g: 0.8, b: 1, a: 1}",
];
export const prefabSource = [
  "%YAML 1.1",
  "%TAG !u! tag:unity3d.com,2011:",
  "--- !u!1001 &1000",
  "PrefabInstance:",
  `  m_SourcePrefab: {fileID: 100100000, guid: ${prefabGuid}, type: 3}`,
  "  m_Modification:",
  "    m_Modifications:",
  `    - target: {fileID: 200, guid: ${prefabGuid}, type: 3}`,
  "      propertyPath: m_LocalPosition.x",
  "      value: 4",
  "      objectReference: {fileID: 0}",
  "--- !u!4 &200 stripped",
  "Transform:",
  "  m_PrefabInstance: {fileID: 1000}",
];
export const assetSource = [
  "%YAML 1.1",
  "%TAG !u! tag:unity3d.com,2011:",
  "--- !u!114 &11400000",
  "MonoBehaviour:",
  "  m_GameObject: {fileID: 0}",
  `  m_Script: {fileID: 11500000, guid: ${scriptGuid}, type: 3}`,
  "  m_Name: Enemy Stats",
  "  health: 50",
  "  speed: 2.5",
  "  loot:",
  "  - item: Coin",
  "    chance: 0.75",
];
export function unityPatch(path: string, source: string[], removed = false) {
  const lines = [
    `@@ ${removed ? `-1,${source.length} +0,0` : `-0,0 +1,${source.length}`} @@`,
    ...source.map((line) => `${removed ? "-" : "+"}${line}`),
  ];
  return `diff --git a/${path} b/${path}\n--- ${removed ? `a/${path}` : "/dev/null"}\n+++ ${removed ? "/dev/null" : `b/${path}`}\n${lines.join("\n")}\n`;
}
export const unityLines = [
  `@@ -0,0 +1,${unitySource.length} @@`,
  ...unitySource.map((line) => `+${line}`),
];
export const unityReview = reviewDiff(unityPatch(unityPath, unitySource))[0];
export const prefabReview = reviewDiff(unityPatch("Assets/Prefabs/Player.prefab", prefabSource))[0];
export const assetReview = reviewDiff(unityPatch("Assets/Data/EnemyStats.asset", assetSource))[0];
