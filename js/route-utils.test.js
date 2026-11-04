import test from "node:test";
import assert from "node:assert/strict";
import { resolveAppRoute } from "./route-utils.js";

test("resolveAppRoute maps SEO links to actual app targets", () => {
  assert.deepEqual(resolveAppRoute("/?view=quick-test&preset=gk"), {
    view: "quick-test",
    preset: "gk",
    query: ""
  });

  assert.deepEqual(resolveAppRoute("/?view=setup"), {
    view: "setup",
    preset: null,
    query: ""
  });

  assert.deepEqual(resolveAppRoute("/#quick-test-view"), {
    view: "quick-test",
    preset: null,
    query: ""
  });
});
