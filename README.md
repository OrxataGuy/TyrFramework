<p align="center">
  <img src=".github/data/logo.png" alt="Tyr Framework" width="180" />
</p>

<h1 align="center">Tyr Framework</h1>

<p align="center">
  A TypeScript-native CLI framework for building, running, and composing automation tools — with zero boilerplate.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@orxataguy/tyr"><img src="https://img.shields.io/npm/v/@orxataguy/tyr.svg" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node 18+" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue" alt="TypeScript" />
</p>

---

## What is Tyr?

Tyr solves the fragmentation problem in DevOps scripting. Instead of maintaining scattered shell scripts, ad-hoc Node utilities, and undocumented automation glue, Tyr gives you a single, typed, dependency-injected context from which every command operates.

You write a function. Tyr takes care of everything else — argument routing, dependency resolution, error formatting, and live documentation.

---

## Installation

```bash
npm install -g @orxataguy/tyr
```

Or as a project dependency:

```bash
npm install @orxataguy/tyr
```

After installing, run the setup command to initialize Tyr in your project:

```bash
tyr install
```

This creates the expected folder structure and registers the `tyr` alias in your shell config.

---

## Quick Start

### 1. Create a command

```bash
tyr gen greet greet
```

This generates `src/commands/greet.tyr.ts` and registers it in `config/map.yml`.

### 2. Edit the command

```typescript
import { TyrContext } from '../core/Kernel';

export default ({ task, fail, logger }: TyrContext) => {
    return async (args: string[]) => {
        if (args.length === 0) {
            fail('A name is required', 'Usage: tyr greet <name>');
        }

        await task('Greeting', async () => {
            logger.success(`Hello, ${args[0]}!`);
        });
    };
};
```

### 3. Run it

```bash
tyr greet World
```

---

## Core Concepts

### Kernel

The Kernel is the main engine. It boots on every invocation, loads `config/map.yml`, resolves the command name to a module, and executes it with a fully-wired `TyrContext`.

You never instantiate the Kernel directly — it runs automatically via `bin/tyr.js`.

### Container & Dependency Injection

All services (Managers) are instantiated once by the `Container` and injected into every command via `TyrContext`. You never import a Manager directly — you destructure it from the context:

```typescript
export default ({ shell, fs, git, logger }: TyrContext) => {
    return async (args: string[]) => {
        const branch = await git.currentBranch();
        logger.info(`On branch: ${branch}`);
    };
};
```

### TyrContext

The object injected into every command. It exposes all available Managers plus framework utilities:

| Property | Type | Description |
|---|---|---|
| `logger` | Logger | Colored terminal output |
| `task` | Function | Wraps async ops with error context |
| `fail` | Function | Throws a controlled `TyrError` |
| `run` | Function | Invokes another Tyr command programmatically |
| `shell` | ShellManager | Execute shell commands |
| `fs` | FileSystemManager | File and directory operations |
| `pkg` | PackageManager | npm package management |
| `docker` | DockerManager | Docker container operations |
| `git` | GitManager | Git operations |
| `system` | SystemManager | OS-level utilities |
| `sql` | SQLManager | MSSQL database queries |
| `web` | WebManager | HTTP requests and web scraping |

### Commands

A command is an exported default function that takes a `TyrContext` and returns an async handler:

```typescript
export default (context: TyrContext) => {
    return async (args: string[]) => {
        // your logic here
    };
};
```

Commands are registered in `config/map.yml`:

```yaml
commands:
  greet: ./src/commands/greet.tyr.ts
  deploy: ./src/commands/deploy.tyr.ts
```

---

## Built-in Commands

### `tyr gen <command-name> [output-file]`

Scaffolds a new command file and registers it in `config/map.yml`.

```bash
tyr gen deploy deploy
# creates src/commands/deploy.tyr.ts
```

### `tyr rem <command-name>`

Removes the command file and its entry from `config/map.yml`.

```bash
tyr rem deploy
```

### `tyr doc`

Parses JSDoc from all Managers and serves an interactive HTML reference at `http://localhost:3000`. Useful for discovering available methods without leaving your terminal.

```bash
tyr doc
# → Open http://localhost:3000
```

---

## Context API Reference

### `task(label, fn)`

Wraps an async operation. If it throws, Tyr captures the error, adds the label as context, and formats a clean error message — no manual `try/catch` needed.

```typescript
const result = await task('Building project', async () => {
    return await shell.exec('npm run build');
});
```

### `fail(message, suggestion?)`

Immediately stops command execution with a formatted error. Optionally include a suggestion to guide the user.

```typescript
if (!args[0]) {
    fail('Missing required argument: name', 'Run: tyr greet <name>');
}
```

### `run(commandName, args)`

Invokes another registered Tyr command from within a command. Enables command composition.

```typescript
await run('install', ['--force']);
```

### `logger`

Standardized colored output. Warnings and errors are suppressed unless `--debug` is passed.

```typescript
logger.info('Starting...');
logger.success('Done.');
logger.warn('Skipping optional step.');
logger.error('Something went wrong.');
```

---

## Error Handling

Tyr distinguishes between controlled and uncontrolled errors.

**Controlled** — use `fail()` for expected validation failures:
```typescript
fail('Config file not found', 'Create a config.yml in the project root.');
```

**Uncontrolled** — wrap risky operations in `task()`:
```typescript
await task('Connecting to database', async () => {
    await sql.connect(connectionString);
});
```

Run any command with `--debug` to see the full stack trace:

```bash
tyr deploy --debug
```

---

## Project Structure

```
├── bin/
│   └── tyr.js                 # CLI entry point
├── src/
│   ├── core/
│   │   ├── Kernel.ts          # Command router and execution engine
│   │   ├── Container.ts       # Dependency injection container
│   │   ├── TyrError.ts        # Structured error type
│   │   ├── util
│   │   │   └── getenv.ts      # Helper: get environment variables
│   │   └── sys/
│   │       ├── gen.ts         # Built-in: scaffold a command
│   │       ├── rem.ts         # Built-in: remove a command
│   │       └── doc.ts         # Built-in: serve live documentation
│   ├── commands/
│   │   └── *.tyr.ts           # Your custom commands go here
│   └── lib/
│   │   ├── AIContextManager.ts
│   │   ├── AIVendorManager.ts
│   │   ├── DockerManager.ts
│   │   ├── FileSystemManager.ts
│   │   ├── GitManager.ts
│   │   ├── JiraManager.ts
│   │   ├── MongoManager.ts
│   │   ├── PackageManager.ts
│   │   ├── PromptTemplateManager.ts
│   │   ├── SetupManager.ts
│   │   ├── ShellManager.ts
│   │   ├── SQLManager.ts
│   │   ├── SystemManager.ts
│   │   ├── TokenManager.ts
│   │   ├── WebManager.ts
│   │   └── WorkspaceManager.ts
|   └── index.ts               # Exports context
└── tests/
    ├── setup.ts               # Mock context factory
    └── test-runner.ts         # Smoke test runner
```

---

## Testing

### Unit tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
npm run test:ui       # Interactive Vitest UI
```

### Smoke tests

Validates that every registered command loads correctly, exports a default function, and can be instantiated without errors:

```bash
npm run test:smoke
```

### Writing tests

Use `createMockContext()` from `tests/setup.ts` to get a fully mocked `TyrContext`:

```typescript
import { createMockContext } from '../tests/setup';
import myCommand from '../src/commands/my-command.tyr';

test('my command runs', async () => {
    const ctx = createMockContext();
    const handler = myCommand(ctx);
    await handler(['arg1']);
    expect(ctx.logger.success).toHaveBeenCalled();
});
```

---

## Dependencies

| Package | Purpose |
|---|---|
| `chalk` | Terminal colors |
| `execa` | Shell command execution |
| `axios` | HTTP requests |
| `inquirer` | Interactive prompts |
| `js-yaml` | YAML config parsing |
| `mssql` | MSSQL database driver |
| `mongodb` | MongoDB driver |
| `cheerio` | HTML parsing / web scraping |
| `dotenv` | Environment variable loading |
| `tsx` | TypeScript execution |

---

## NPM & Community

Tyr is published on npm as [`@orxataguy/tyr`](https://www.npmjs.com/package/@orxataguy/tyr).

The project follows a hybrid open community model — the main repository is open, and contributors are encouraged to publish their own forks under their own npm scope. You do not need permission from the maintainer to fork, improve, or publish your own version.

### Publishing your own distribution

1. Fork this repository
2. Make your changes
3. Update the `name` field in `package.json` to your own npm scope:
   ```json
   "name": "@yourname/tyr"
   ```
4. Add your `NPM_TOKEN` as a secret in your forked repo settings, then push a tag like `v1.0.0` — the release workflow will handle the rest automatically
5. Users can then install your version with:
   ```bash
   npm i @yourname/tyr
   ```

If you want your fork listed as a community distribution, open a PR adding it to [`COMMUNITY.md`](COMMUNITY.md).

---

## License

MIT — [Manel Andreu Pérez](https://github.com/orxataguy)
