import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { calculateBootPrice, countActiveContributors } from "./pricing";

// The config default launchTs is now a far-FUTURE sentinel, so the pre-existing
// count tests pass an explicit far-PAST cutoff to isolate the anti-inflation logic
// from the launch cutoff (which has its own dedicated case below).
const PAST = "2000-01-01 00:00:00";

/** Space-format UTC timestamp `offsetDays` from now (negative = in the past). */
function daysFromNow(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "")
    .slice(0, 19);
}

function makeDb() {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    author_name TEXT NOT NULL,
    signature TEXT,
    pubkey TEXT,
    tx_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  return db;
}

describe("countActiveContributors (boot-price anti-inflation)", () => {
  it("counts only pubkeys with >= 3 posts; ignores drive-by single-post identities", () => {
    const db = makeDb();
    const ins = db.prepare("INSERT INTO posts (content, author_name, pubkey) VALUES (?,?,?)");
    for (let i = 0; i < 3; i++) ins.run("x", "anon_aaaa", "pk_established"); // 3 posts → counts
    for (let i = 0; i < 5; i++) ins.run("x", "anon_bbbb", "pk_active"); // 5 posts → counts
    for (let i = 0; i < 10; i++) ins.run("x", "anon_cccc", `pk_spam_${i}`); // 1 each → ignored

    // Only the 2 established contributors count — not the 10 fake identities that
    // would otherwise push the dynamic boot price toward the ceiling.
    expect(countActiveContributors(db, PAST)).toBe(2);
  });

  it("ignores null-pubkey posts", () => {
    const db = makeDb();
    const ins = db.prepare("INSERT INTO posts (content, author_name, pubkey) VALUES (?,?,?)");
    for (let i = 0; i < 5; i++) ins.run("x", "anon_aaaa", null);
    expect(countActiveContributors(db, PAST)).toBe(0);
  });

  it("excludes pre-launch established contributors (launchTs cutoff)", () => {
    const db = makeDb();
    const ins = db.prepare(
      "INSERT INTO posts (content, author_name, pubkey, created_at) VALUES (?,?,?,?)"
    );
    // All fixtures are within the 30-day active window; only the launchTs cutoff
    // (3 days ago) distinguishes them, so this isolates the launch filter.
    const cutoff = daysFromNow(-3);
    // Established pubkey with 3 posts BEFORE launch → excluded.
    for (let i = 0; i < 3; i++) ins.run("x", "anon_pre", "pk_prelaunch", daysFromNow(-5));
    // Established pubkey with 3 posts AFTER launch → counted.
    for (let i = 0; i < 3; i++) ins.run("x", "anon_post", "pk_postlaunch", daysFromNow(-1));

    expect(countActiveContributors(db, cutoff)).toBe(1);
  });
});

describe("calculateBootPrice", () => {
  it("returns floor when contributors × rate is below floor", () => {
    // 1 contributor × 156 = 156 < 1000 floor
    expect(calculateBootPrice(1)).toBe(1_000);
  });

  it("scales linearly with contributors", () => {
    // 10 contributors × 156 = 1560
    expect(calculateBootPrice(10)).toBe(1_560);
  });

  it("returns ceiling when price exceeds max", () => {
    // 2000 contributors × 156 = 312,000 > 250,000 ceiling
    expect(calculateBootPrice(2000)).toBe(250_000);
  });

  it("returns exact value within range", () => {
    // 100 contributors × 156 = 15,600 (within range)
    expect(calculateBootPrice(100)).toBe(15_600);
  });

  it("handles zero contributors", () => {
    expect(calculateBootPrice(0)).toBe(1_000); // floor
  });
});
