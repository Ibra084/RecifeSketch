/**
 * Terminal tool for student alias accounts and admin access. Runs locally
 * with the service-role key. Most people will use the /admin page instead;
 * `make-admin` is how the first administrator gets access to that page.
 *
 *   npm run alias -- make-admin <email>      give a personal account the admin page
 *   npm run alias -- remove-admin <email>    take it away again
 *   npm run alias -- create <alias>          issue an alias + temporary password
 *   npm run alias -- reset-password <alias>  issue a new temporary password
 *   npm run alias -- delete <alias>          delete the account and its whiteboards
 *   npm run alias -- list                    list alias accounts
 *   npm run alias -- bulk <prefix> <count> [start]   a numbered class, e.g. bulk maths7b 30
 *   npm run alias -- bulk-list <file>        one alias per line from a text file
 *
 * The bulk commands print CSV (alias,temporary_password) - redirect it to a
 * file: npm run alias -- bulk maths7b 30 > maths7b.csv
 */
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import {
  AliasAdminError,
  aliasSeries,
  createAliasAccounts,
  parseAliasList,
  type BulkAliasResult,
  createAliasAccount,
  deleteAliasAccount,
  listAliasAccounts,
  resetAliasPassword,
  setAdminRole,
} from "../src/lib/auth/alias-admin.ts"
import { DEFAULT_ALIAS_EMAIL_DOMAIN } from "../src/lib/auth/identity.ts"

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const aliasDomain = process.env.ALIAS_EMAIL_DOMAIN?.trim().toLowerCase() || DEFAULT_ALIAS_EMAIL_DOMAIN

function fail(message: string): never {
  console.error(`✖ ${message}`)
  process.exit(1)
}

if (!url || !serviceRoleKey) fail("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.")

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const [command, arg, arg2, arg3] = process.argv.slice(2)
const need = (what: string) => arg ?? fail(`Give ${what}.`)

/** CSV to stdout (for the file), a summary to stderr (for the person). */
function printBulk(results: BulkAliasResult[], invalid: string[] = []) {
  console.log("alias,temporary_password")
  for (const r of results) if ("password" in r) console.log(`${r.alias},${r.password}`)
  const created = results.filter((r) => "password" in r).length
  console.error(`✔ Created ${created} account(s).`)
  for (const r of results) if ("error" in r) console.error(`  skipped ${r.alias}: ${r.error}`)
  if (invalid.length) console.error(`  not valid aliases (ignored): ${invalid.join(", ")}`)
}

try {
  switch (command) {
    case "make-admin": {
      const { email } = await setAdminRole(admin, need("an email"), aliasDomain, true)
      console.log(`✔ ${email} can now open /admin. Sign out and back in for it to take effect.`)
      break
    }
    case "remove-admin": {
      const { email } = await setAdminRole(admin, need("an email"), aliasDomain, false)
      console.log(`✔ ${email} is no longer an admin.`)
      break
    }
    case "create": {
      const { alias, password } = await createAliasAccount(admin, need("an alias, e.g. maths7b-amira"), aliasDomain)
      console.log(`✔ Created alias account\n  Alias:              ${alias}\n  Temporary password: ${password}`)
      break
    }
    case "reset-password": {
      const { alias, password } = await resetAliasPassword(admin, need("an alias"), aliasDomain)
      console.log(`✔ New temporary password for ${alias}: ${password}`)
      break
    }
    case "delete": {
      const { alias } = await deleteAliasAccount(admin, need("an alias"), aliasDomain)
      console.log(`✔ Deleted ${alias} and their whiteboards.`)
      break
    }
    case "bulk": {
      const count = Number(arg2)
      if (!arg || !Number.isFinite(count)) fail("Usage: npm run alias -- bulk <prefix> <count> [start]")
      printBulk(await createAliasAccounts(admin, aliasSeries(arg, count, arg3 ? Number(arg3) : 1), aliasDomain))
      break
    }
    case "bulk-list": {
      const { aliases, invalid } = parseAliasList(await readFile(need("a file with one alias per line"), "utf8"))
      printBulk(await createAliasAccounts(admin, aliases, aliasDomain), invalid)
      break
    }
    case "list":
      for (const a of await listAliasAccounts(admin, aliasDomain)) {
        console.log(`${a.alias}${a.pendingPasswordChange ? "  (temporary password)" : ""}`)
      }
      break
    default:
      fail("Usage: npm run alias -- <make-admin|remove-admin|create|reset-password|delete|list|bulk|bulk-list> [args]")
  }
} catch (err) {
  fail(err instanceof AliasAdminError ? err.message : String(err))
}
