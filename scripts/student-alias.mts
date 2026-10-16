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
 */
import { createClient } from "@supabase/supabase-js"
import {
  AliasAdminError,
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
const [command, arg] = process.argv.slice(2)
const need = (what: string) => arg ?? fail(`Give ${what}.`)

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
    case "list":
      for (const a of await listAliasAccounts(admin, aliasDomain)) {
        console.log(`${a.alias}${a.pendingPasswordChange ? "  (temporary password)" : ""}`)
      }
      break
    default:
      fail("Usage: npm run alias -- <make-admin|remove-admin|create|reset-password|delete|list> [alias or email]")
  }
} catch (err) {
  fail(err instanceof AliasAdminError ? err.message : String(err))
}
