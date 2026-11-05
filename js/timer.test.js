import test from "node:test";
import assert from "node:assert/strict";
import { createTimer } from "./timer.js";

test("resumed timers retain their original deadline", () => {
  const originalNow = Date.now;
  const originalWindow = globalThis.window;
  let now = 1000000;
  let tickInterval;
  const ticks = [];
  Date.now = () => now;
  globalThis.window = {
    setInterval(callback) {
      tickInterval = callback;
      return 1;
    },
    clearInterval() {}
  };

  try {
    const timer = createTimer({
      durationSeconds:60,
      startedAt:now - 10000,
      onTick:remaining => ticks.push(remaining),
      onExpire:() => assert.fail("Timer expired too early.")
    });
    timer.start();
    assert.equal(ticks[0], 50);
    now += 20000;
    tickInterval();
    assert.equal(ticks.at(-1), 30);
    assert.equal(timer.elapsedSeconds(), 30);
    assert.equal(timer.remainingSeconds(), 30);
    timer.stop();
  } finally {
    Date.now = originalNow;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("a resumed timer that has expired submits immediately", () => {
  const originalNow = Date.now;
  const originalWindow = globalThis.window;
  const now = 1000000;
  let expired = 0;
  Date.now = () => now;
  globalThis.window = {
    setInterval() {
      assert.fail("An expired timer must not start an interval.");
    },
    clearInterval() {}
  };

  try {
    const timer = createTimer({
      durationSeconds:60,
      startedAt:now - 60000,
      onTick:remaining => assert.equal(remaining, 0),
      onExpire:() => expired++
    });
    timer.start();
    assert.equal(expired, 1);
    assert.equal(timer.elapsedSeconds(), 60);
    assert.equal(timer.remainingSeconds(), 0);
  } finally {
    Date.now = originalNow;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
