import test from "node:test";
import assert from "node:assert/strict";
import { inlineFileContents } from "../ui/fileContents.ts";
import { referencedSceneReview } from "./fixtures/file-contents.ts";

test("inline review shows the scene's contents without cards for referenced files", () => {
  const file = referencedSceneReview;
  const contents = inlineFileContents(file);
  assert.deepEqual(
    contents.changes.map((change) => change.kind),
    ["scene", "sub_resource", "node", "connection"],
  );
  assert.equal(contents.filePath, "Scenes/lamp.tscn");
  assert.deepEqual(
    contents.changes
      .find((change) => change.kind === "node")
      ?.properties.filter((p) => ["position", "script"].includes(p.name))
      .map((p) => [p.name, p.after]),
    [
      ["position", "Vector2(10, 20)"],
      ["script", 'ExtResource("1")'],
    ],
  );
  assert.equal(
    contents.changes
      .find((change) => change.kind === "sub_resource")
      ?.properties.find((property) => property.name === "shader_parameter/energy")?.after,
    "0.75",
  );
  assert.equal(contents.changes.find((change) => change.kind === "connection")?.operation, "added");
  assert.equal(file.changes.filter((change) => change.kind === "ext_resource").length, 2);
  assert.equal(contents.rawDiff, file.rawDiff);
  assert.ok(contents.rawDiff.includes("light_controller.gd"));
});
