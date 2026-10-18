/**
 * Copies bug reports sent from the deployed app (stored in the private
 * "bug-reports" bucket) into this project's bug-reports/ folder, so they can
 * be read and fixed like local ones. Reports already copied are skipped.
 *
 *   npm run bugs:pull
 */
import { mkdir, writeFile, access } from "node:fs/promises"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("✖ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.")
  process.exit(1)
}

const bucket = createClient(url, key, { auth: { persistSession: false } }).storage.from("bug-reports")
const root = path.join(process.cwd(), "bug-reports")
const exists = (p: string) => access(p).then(() => true, () => false)

const { data: folders, error } = await bucket.list("", { limit: 1000, sortBy: { column: "name", order: "asc" } })
if (error) {
  console.error(`✖ ${error.message}`)
  process.exit(1)
}
let copied = 0
for (const folder of folders ?? []) {
  const dir = path.join(root, folder.name)
  if (await exists(path.join(dir, "report.md"))) continue
  const { data: files } = await bucket.list(folder.name, { limit: 20 })
  await mkdir(dir, { recursive: true })
  for (const file of files ?? []) {
    const { data } = await bucket.download(`${folder.name}/${file.name}`)
    if (data) await writeFile(path.join(dir, file.name), Buffer.from(await data.arrayBuffer()))
  }
  console.log(`✔ ${folder.name}`)
  copied++
}
console.log(copied ? `Copied ${copied} new report(s) into bug-reports/.` : "No new reports.")
