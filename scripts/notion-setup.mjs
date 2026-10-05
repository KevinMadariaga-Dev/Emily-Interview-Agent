#!/usr/bin/env node
// Creates (or completes) the "Emily · Entrevistas" Notion database used to store interview reports.
//
//   pnpm notion:setup <url-o-id-de-la-pagina>
//
// - No NOTION_DATA_SOURCE_ID yet: creates the database inside that page (the page must be shared
//   with your integration: page ··· → Connections → your integration) and writes the id to .env.local.
// - NOTION_DATA_SOURCE_ID already set: adds any missing columns to that database.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const envPath = `${root}.env.local`;
const envText = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.trim().replace(/^["']|["']$/g, "")]),
);
const schema = JSON.parse(readFileSync(`${root}src/features/landing/notion-schema.json`, "utf8"));

const key = env.NOTION_API_KEY;
const version = env.NOTION_API_VERSION || "2025-09-03";
if (!key) fail("Falta NOTION_API_KEY en .env.local (paso 1 de la guía).");

async function notion(path, method, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Notion-Version": version,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) fail(`Notion ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  return json;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function setEnv(name, value) {
  const line = `${name}=${value}`;
  const next = new RegExp(`^${name}=.*$`, "m").test(envText)
    ? envText.replace(new RegExp(`^${name}=.*$`, "m"), line)
    : `${envText.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, next);
}

const existing = env.NOTION_DATA_SOURCE_ID;
if (existing) {
  const ds = await notion(`/data_sources/${existing}`, "GET");
  const missing = Object.fromEntries(
    Object.entries(schema).filter(([name]) => !(name in (ds.properties ?? {}))),
  );
  // A database has exactly one title column; never add a second one.
  if (Object.values(ds.properties ?? {}).some((p) => p.type === "title")) delete missing.Entrevista;
  if (!Object.keys(missing).length) {
    console.log("✔ La base ya tiene todas las columnas. Nada que hacer.");
  } else {
    await notion(`/data_sources/${existing}`, "PATCH", { properties: missing });
    console.log(`✔ Columnas agregadas: ${Object.keys(missing).join(", ")}`);
  }
  process.exit(0);
}

const raw = process.argv[2] || env.NOTION_PARENT_PAGE_ID;
const pageId = raw?.replace(/-/g, "").match(/[0-9a-f]{32}/i)?.[0];
if (!pageId)
  fail("Pásame la página donde crear la base:  pnpm notion:setup <url-de-la-página-de-notion>");

const db = await notion("/databases", "POST", {
  parent: { type: "page_id", page_id: pageId },
  icon: { type: "emoji", emoji: "🎙️" },
  title: [{ type: "text", text: { content: "Emily · Entrevistas" } }],
  initial_data_source: { properties: schema },
});
const dataSourceId =
  db.data_sources?.[0]?.id ?? (await notion(`/databases/${db.id}`, "GET")).data_sources?.[0]?.id;
if (!dataSourceId) fail("Notion creó la base pero no devolvió su data source id.");

setEnv("NOTION_DATA_SOURCE_ID", dataSourceId);
console.log(`✔ Base "Emily · Entrevistas" creada: ${db.url}`);
console.log("✔ NOTION_DATA_SOURCE_ID guardado en .env.local. Reinicia `pnpm dev`.");
