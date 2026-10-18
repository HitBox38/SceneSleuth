import { reviewDiff } from "../../content_script/scripts/diffParser.ts";

// Synthetic nested InputActionProperty. The native hunk deliberately omits
// both the Unity document header and the owning top-level property.
export const contextBefore = [
  "%YAML 1.1",
  "%TAG !u! tag:unity3d.com,2011:",
  "--- !u!1 &1",
  "GameObject:",
  "  m_Name: Rig",
  "--- !u!4 &2",
  "Transform:",
  "  m_GameObject: {fileID: 1}",
  "  m_Father: {fileID: 0}",
  "--- !u!1 &10",
  "GameObject:",
  "  m_Name: Camera",
  "--- !u!4 &11",
  "Transform:",
  "  m_GameObject: {fileID: 10}",
  "  m_Father: {fileID: 2}",
  "--- !u!20 &12",
  "Camera:",
  "  m_GameObject: {fileID: 10}",
  "  near clip plane: 0.01",
  "--- !u!114 &13",
  "MonoBehaviour:",
  "  m_GameObject: {fileID: 10}",
  "  m_EditorClassIdentifier: Example.Input::Example.CameraInput",
  "  m_TrackingStateInput:",
  "    m_UseReference: 0",
  "    m_Action:",
  "      m_Name: Tracking State Input",
  "      m_Type: 0",
  "      m_ExpectedControlType: Integer",
  "      m_Id: action-id",
  "      m_Processors: ",
  "      m_Interactions: ",
  "      m_SingletonActionBindings: []",
  "      m_Flags: 0",
  "    m_Reference: {fileID: 0}",
  "  unrelated: 42",
];
export const bindingLines = [
  "      m_SingletonActionBindings:",
  ...["<XRHMD>/trackingState", "<HandheldARInputDevice>/trackingState"].flatMap((path, index) => [
    "      - m_Name: ",
    `        m_Id: binding-${index}`,
    `        m_Path: ${path}`,
    "        m_Interactions: ",
    "        m_Processors: ",
    "        m_Groups: ",
    "        m_Action: Tracking State Input",
    "        m_Flags: 0",
  ]),
];
const index = contextBefore.findIndex((line) => line.includes("m_SingletonActionBindings"));
export const contextAfter = [
  ...contextBefore.slice(0, index),
  ...bindingLines,
  ...contextBefore.slice(index + 1),
];
export const contextPatch = [
  "diff --git a/Assets/Old.unity b/Assets/New.unity",
  "--- a/Assets/Old.unity",
  "+++ b/Assets/New.unity",
  `@@ -${index},3 +${index},${bindingLines.length + 2} @@`,
  " " + contextBefore[index - 1],
  "-" + contextBefore[index],
  ...bindingLines.map((line) => "+" + line),
  " " + contextBefore[index + 1],
  "",
].join("\n");
export const contextReview = reviewDiff(contextPatch)[0];
