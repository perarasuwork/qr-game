/* ---------------------------------------------------------------------------
 * valtown-leaderboard.ts — the shared leaderboard's server side
 *
 * This file does NOT run in the browser and is not loaded by index.html. It
 * is kept here so the server code is version-controlled alongside the game
 * instead of living only in a web editor.
 *
 * TO DEPLOY IT
 *   1. val.town  ->  Sign in with GitHub  (no new account needed)
 *   2. New project, then click "HTTP server" under "Get started" — that
 *      scaffolds main.ts *and* attaches the HTTP trigger that gives it a URL
 *   3. Select all of main.ts, paste this file over it, Save
 *   4. Copy the endpoint URL, which looks like
 *        https://<your-username>-<project>.web.val.run
 *   5. Paste that URL into leaderboard.js, in CONFIG.flow.postUrl
 *
 * WHY A FUNCTION RATHER THAN A DATABASE THE PAGE TALKS TO DIRECTLY
 * The game is a public static page, so anything it holds is public. If the
 * page carried a database credential, everyone would have permission to wipe
 * the board. Here the storage is reachable only through this function, and
 * the function offers no way to change or delete a round — only to add one.
 * That is the same guarantee the Firestore rules gave, enforced server-side,
 * plus validation that a browser cannot argue with.
 * ------------------------------------------------------------------------- */

import { sqlite } from "https://esm.town/v/std/sqlite";

const TABLE = "scan_solve_scores";
const MAX_ROWS = 200;   // returned per request, already ranked
const MAX_NAME = 28;    // matches the maxlength on the input in index.html

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

await sqlite.execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (
  id    TEXT PRIMARY KEY,
  name  TEXT    NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  pct   INTEGER NOT NULL,
  at    INTEGER NOT NULL
)`);

interface Row {
  id: string;
  name: string;
  score: number;
  total: number;
  pct: number;
  at: number;
}

// libsql has returned rows as arrays in some versions and as objects in
// others, so read each column by name with a positional fallback.
function toRow(r: any): Row {
  const col = (name: string, i: number) =>
    r && r[name] !== undefined ? r[name] : r[i];
  return {
    id: String(col("id", 0)),
    name: String(col("name", 1)),
    score: Number(col("score", 2)),
    total: Number(col("total", 3)),
    pct: Number(col("pct", 4)),
    at: Number(col("at", 5)),
  };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    // Posting application/json triggers a preflight, so answer it.
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method === "GET") {
    const result = await sqlite.execute(
      `SELECT id, name, score, total, pct, at FROM ${TABLE}
        ORDER BY pct DESC, score DESC, at ASC
        LIMIT ${MAX_ROWS}`,
    );
    return json((result.rows || []).map(toRow));
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Body must be JSON" }, 400);
    }

    // This endpoint is open to the internet, so nothing in the body is
    // trusted: every field is checked and clamped before it is stored.
    const id = String(body?.id ?? "").trim().slice(0, 40);
    if (!id) return json({ error: "id is required" }, 400);

    const name =
      String(body?.name ?? "").trim().slice(0, MAX_NAME) || "Anonymous";

    const score = Number(body?.score);
    const total = Number(body?.total);
    if (!Number.isInteger(score) || !Number.isInteger(total)) {
      return json({ error: "score and total must be whole numbers" }, 400);
    }
    if (total < 1 || total > 100) {
      return json({ error: "total out of range" }, 400);
    }
    if (score < 0 || score > total) {
      return json({ error: "score out of range" }, 400);
    }

    // pct is recomputed rather than taken on trust, so the board cannot be
    // gamed by posting 3/10 with a pct of 100.
    const pct = Math.round((score / total) * 100);

    const claimed = Number(body?.at);
    const now = Date.now();
    const at =
      Number.isInteger(claimed) && claimed > 0 && claimed < now + 60_000
        ? claimed
        : now;

    // INSERT OR IGNORE makes a retried upload harmless: the same id lands
    // once. There is deliberately no UPDATE and no DELETE anywhere in this
    // file, so a round, once recorded, cannot be altered or removed by anyone
    // holding this URL.
    await sqlite.execute({
      sql: `INSERT OR IGNORE INTO ${TABLE} (id, name, score, total, pct, at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, name, score, total, pct, at],
    });

    return json({ ok: true, id });
  }

  return json(
    { error: "Use GET to read the board or POST to add a round" },
    405,
  );
}
