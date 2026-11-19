import assert from "node:assert/strict";
import { createServer } from "vite";
import { resolve } from "node:path";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { "@": resolve("src") } },
});

try {
  const companion = await server.ssrLoadModule("/src/lib/ascension/dementia-companion.ts");
  const none = { day: "", ids: [] };
  const morning = new Date(2026, 10, 8, 8, 15);
  const due = companion.dueReminder(morning, none, { place: "the kitchen" });
  assert.equal(due.id, "morning");
  assert.match(due.text, /the kitchen/);
  assert.doesNotMatch(due.text, /\d+\s*mg/);

  const seen = companion.acknowledge(none, morning, "morning");
  assert.equal(companion.dueReminder(morning, seen), null);

  const night = new Date(2026, 10, 8, 22, 30);
  assert.equal(companion.inQuietHours(companion.minuteOfDay(night)), true);
  assert.equal(companion.dueReminder(night, none), null);

  const water = companion.dueReminder(new Date(2026, 10, 8, 10, 5), none);
  assert.equal(water.id, "water");
  const meal = companion.dueReminder(new Date(2026, 10, 8, 12, 0), none);
  assert.equal(meal.id, "meal");
  const medicine = companion.dueReminder(new Date(2026, 10, 8, 16, 30), none);
  assert.equal(medicine.id, "medicine");
  assert.match(medicine.text, /already set out/);
  assert.doesNotMatch(medicine.text, /\d+\s*mg/);

  const urgent = companion.readSafety("I fell and my chest hurts");
  assert.equal(urgent.level, "urgent");
  assert.equal(urgent.notifyCaregiver, true);
  const lost = companion.readSafety("I am lost and scared");
  assert.equal(lost.level, "caregiver");
  const calm = companion.readSafety("I am okay");
  assert.equal(calm.level, "calm");
  assert.equal(calm.notifyCaregiver, false);

  assert.equal(companion.cleanPhone("555-0100"), "555-0100");
  assert.equal(companion.cleanPhone("not a phone"), "");
  assert.equal(companion.cleanPlace("Kitchen <script>"), "Kitchen script");

  console.log("PASS dementia companion offers one gentle reminder and a safety reading");
} finally {
  await server.close();
}
