import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectDir = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const inputPath = resolve(projectDir, "pipeline/output/taiwan-bar-ai/requests.jsonl");
const outputDir = resolve(projectDir, "pipeline/output/taiwan-bar-ai/shards");
const shardSize = Number(process.argv.find((value) => value.startsWith("--size="))?.split("=")[1] || 25);
const singlePart = Number(process.argv.find((value) => value.startsWith("--part="))?.split("=")[1] || 0);
if (!Number.isInteger(shardSize) || shardSize < 1) throw new Error("--size must be a positive integer");
if (!Number.isInteger(singlePart) || singlePart < 0) throw new Error("--part must be a non-negative integer");

const tasks = (await readFile(inputPath, "utf8")).split(/\r?\n/).filter(Boolean).map(JSON.parse);
await mkdir(outputDir, { recursive: true });
if (singlePart) {
  const offset = (singlePart - 1) * shardSize;
  const items = tasks.slice(offset, offset + shardSize);
  if (!items.length) throw new Error(`--part=${singlePart} is outside the request set`);
  const number = String(singlePart).padStart(3, "0");
  const name = `part-${number}.jsonl`;
  await writeFile(resolve(outputDir, name), `${items.map(JSON.stringify).join("\n")}\n`, "utf8");
  console.log(`Rebuilt ${name}: ${items.length} tasks (${items[0].id}..${items.at(-1).id})`);
  process.exit(0);
}
const manifest = [];
for (let offset = 0; offset < tasks.length; offset += shardSize) {
  const items = tasks.slice(offset, offset + shardSize);
  const number = String(manifest.length + 1).padStart(3, "0");
  const name = `part-${number}.jsonl`;
  await writeFile(resolve(outputDir, name), `${items.map(JSON.stringify).join("\n")}\n`, "utf8");
  manifest.push({ name, count: items.length, first_id: items[0].id, last_id: items.at(-1).id, status: "pending" });
}
await writeFile(resolve(outputDir, "manifest.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), shard_size: shardSize, total: tasks.length, shards: manifest }, null, 2)}\n`, "utf8");
console.log(`Sharded ${tasks.length} tasks into ${manifest.length} files of up to ${shardSize}`);
