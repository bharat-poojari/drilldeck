import test from "node:test";
import assert from "node:assert/strict";
import accountHandler from "./account.js";
import historyHandler from "./history.js";

test("individual account and online history endpoints are disabled", async () => {
  for (const [handler, method] of [[accountHandler, "POST"], [historyHandler, "GET"]]) {
    const response = {
      statusCode:0,
      headers:{},
      setHeader(name, value) { this.headers[name] = value; },
      end(body) { this.body = body; }
    };
    await handler({ method }, response);
    assert.equal(response.statusCode, 410);
    assert.match(JSON.parse(response.body).error, /no longer available/i);
  }
});
