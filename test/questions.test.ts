import assert from "node:assert/strict";
import test from "node:test";
import { BATTERIES } from "../src/questions/index.js";
import { toQuestions } from "../src/questions/sdk.js";

test("each bot has one battery and every choice has an other option", () => {
  assert.deepEqual(Object.keys(BATTERIES).sort(), ["gambler", "house", "spy"]);
  for (const battery of Object.values(BATTERIES)) {
    assert.ok(battery.questions.length > 1);
    const sdk = toQuestions(battery.questions);
    assert.equal(Object.keys(sdk).length, battery.questions.length);
    for (const question of battery.questions) {
      if (question.type === "choice") {
        assert.ok(question.criteria.other.length > 0);
        assert.equal(Object.keys(question.criteria).includes("other"), true);
      }
    }
  }
});
