// Regenerate src/api/schema.d.ts from the FastAPI app, so the frontend's API types always match the backend.
// Run with `npm run api:types` after changing an endpoint or schema in backend/.
import { execFileSync, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(frontend, '..')
const python = process.platform === 'win32'
  ? join(root, '.venv', 'Scripts', 'python.exe')
  : join(root, '.venv', 'bin', 'python')

const spec = execFileSync(python, ['-c', 'import json; from app.main import create_app; print(json.dumps(create_app().openapi()))'], {
  cwd: join(root, 'backend'),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})
const specFile = join(frontend, 'node_modules', '.tmp', 'openapi.json')
mkdirSync(dirname(specFile), { recursive: true })
writeFileSync(specFile, spec)

// openapi-typescript needs TypeScript 5, while the app uses TypeScript 7, so it runs in its own npx environment.
const output = join(frontend, 'src', 'api', 'schema.d.ts')
execSync(`npx --yes -p typescript@5.9.3 -p openapi-typescript@7.13.0 openapi-typescript "${specFile}" -o "${output}"`,
  { stdio: 'inherit' })
