import test from "node:test";
import assert from "node:assert/strict";
import handler from "./leaderboard.js";

test("leaderboard requires explicit consent and supports private owner controls", async () => {
  const previousEnvironment = {
    token:process.env.EXAMDESK_GITHUB_TOKEN,
    owner:process.env.EXAMDESK_GITHUB_OWNER,
    repo:process.env.EXAMDESK_GITHUB_REPO,
    branch:process.env.EXAMDESK_GITHUB_BRANCH,
    secret:process.env.EXAMDESK_SESSION_SECRET,
    legacySecret:process.env.drilldeck_SESSION_SECRET
  };
  const originalFetch = globalThis.fetch;
  const ownerKey = "9424ee19-2c2d-40c1-bc1a-298624ba0a2e";
  const otherOwnerKey = "6498ee19-2c2d-40c1-bc1a-298624ba0a2e";
  const id = "39b30ee1-4601-4ad7-9c2c-12fae7be68a8";
  let storedContent = null;
  let writeCount = 0;

  Object.assign(process.env, {
    EXAMDESK_GITHUB_TOKEN:"test-token",
    EXAMDESK_GITHUB_OWNER:"test-owner",
    EXAMDESK_GITHUB_REPO:"test-storage",
    EXAMDESK_GITHUB_BRANCH:"test-branch"
  });
  delete process.env.EXAMDESK_SESSION_SECRET;
  delete process.env.drilldeck_SESSION_SECRET;

  globalThis.fetch = async (url, options) => {
    if (options.method === "PUT") {
      writeCount++;
      storedContent = JSON.parse(Buffer.from(JSON.parse(options.body).content, "base64").toString("utf8"));
      return { ok:true, status:201, json:async () => ({ sha:"test-sha" }) };
    }
    if (!storedContent) return { ok:false, status:404 };
    return {
      ok:true,
      status:200,
      json:async () => ({
        content:Buffer.from(JSON.stringify(storedContent)).toString("base64"),
        encoding:"base64",
        sha:"test-sha"
      })
    };
  };

  try {
    const denied = await callHandler({
      method:"POST",
      headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
      body:{
        id, publishConsent:false, ownerKey, score:8, maximum:10,
        scorePercentage:80, paper:"General Knowledge", subjects:["History"]
      }
    });
    assert.equal(denied.statusCode, 403);
    assert.equal(writeCount, 0);

    const published = await callHandler({
      method:"POST",
      headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
      body:{
        id, publishConsent:true, ownerKey, name:"Practice student", score:8, maximum:10,
        scorePercentage:80, paper:"General Knowledge", subjects:["History"]
      }
    });
    assert.equal(published.statusCode, 201);
    assert.equal(storedContent.scores.length, 1);
    assert.notEqual(storedContent.scores[0].ownerKeyHash, ownerKey);
    assert.equal(JSON.parse(published.body).score.name, "Practice student");

    const publicList = await callHandler({ method:"GET", headers:{} });
    assert.equal(publicList.statusCode, 200);
    assert.equal(JSON.stringify(publicList.body).includes("ownerKeyHash"), false);

    const deniedRename = await callHandler({
      method:"PATCH",
      headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
      body:{ id, ownerKey:otherOwnerKey, name:"Someone else" }
    });
    assert.equal(deniedRename.statusCode, 404);
    assert.equal(storedContent.scores[0].name, "Practice student");

    const renamed = await callHandler({
      method:"PATCH",
      headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
      body:{ id, ownerKey, name:"New display name" }
    });
    assert.equal(renamed.statusCode, 200);
    assert.equal(storedContent.scores[0].name, "New display name");

    const removed = await callHandler({
      method:"DELETE",
      headers:{ origin:"https://drilldeck.example", host:"drilldeck.example" },
      body:{ id, ownerKey }
    });
    assert.equal(removed.statusCode, 200);
    assert.equal(storedContent.scores.length, 0);
    assert.equal(writeCount, 3);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("EXAMDESK_GITHUB_TOKEN", previousEnvironment.token);
    restoreEnvironment("EXAMDESK_GITHUB_OWNER", previousEnvironment.owner);
    restoreEnvironment("EXAMDESK_GITHUB_REPO", previousEnvironment.repo);
    restoreEnvironment("EXAMDESK_GITHUB_BRANCH", previousEnvironment.branch);
    restoreEnvironment("EXAMDESK_SESSION_SECRET", previousEnvironment.secret);
    restoreEnvironment("drilldeck_SESSION_SECRET", previousEnvironment.legacySecret);
  }
});

async function callHandler(request) {
  const response = {
    statusCode:0,
    headers:{},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = body; }
  };
  await handler(request, response);
  return response;
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
