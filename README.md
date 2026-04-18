# GitHub ↔ Supabase Debug Connection

អត្ថបទនេះសម្រាប់ connect GitHub Actions ទៅ Supabase ដើម្បីអាន/debug ដោយសុវត្ថិភាព។

## 1) Prepare Supabase values

ត្រូវមាន:

- `SUPABASE_URL` (Project URL)
- `SUPABASE_ANON_KEY` (read-only/API debug)
- `SUPABASE_DB_URL` (optional, សម្រាប់ SQL debug តាម `psql`)

> សម្រាប់ SQL debug គួរប្រើ database user/role ដែល read-only។

## 2) Add GitHub secrets

នៅក្នុង repo:

1. `Settings` → `Secrets and variables` → `Actions`
2. ចុច `New repository secret`
3. បញ្ចូល secrets ខាងក្រោម:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_DB_URL` (optional)

## 3) Run the debug workflow

Workflow file:  
`/home/runner/work/dagrandv3/dagrandv3/.github/workflows/supabase-debug.yml`

របៀប run:

1. ចូល `Actions` tab
2. ជ្រើស `Supabase Debug Check`
3. ចុច `Run workflow`
4. បើចង់ SQL query ផងដែរ សូមធីក `run_db_query=true`

## 4) What this workflow checks

- ពិនិត្យថា secrets ចាំបាច់មានរួច
- ធ្វើ read-only check ទៅ `${SUPABASE_URL}/auth/v1/settings`
- (optional) ធ្វើ SQL connectivity check:
  - `select current_database(), current_user, now()`

បើ step ណាមួយ fail workflow នឹង fail ហើយបង្ហាញ logs សម្រាប់ debug។

## 5) Security notes

- កុំ commit keys ទៅក្នុង source code
- ប្រើ key/credential កម្រិតសិទ្ធិទាប (read-only) សម្រាប់ debug
- បើសង្ស័យ leaked key → rotate key ភ្លាមៗ
