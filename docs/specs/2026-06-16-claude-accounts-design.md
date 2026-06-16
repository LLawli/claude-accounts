# claude-accounts — Design

Date: 2026-06-16
Status: approved (design)

## Problem

Claude Code binds one logged-in account per config dir (`~/.claude`, account in
`.credentials.json` + `oauthAccount` inside `.claude.json`). Users with multiple
accounts today juggle parallel config dirs via `CLAUDE_CONFIG_DIR`, duplicating
hooks/skills/settings and re-logging through the browser to switch.

`claude-accounts` keeps a single `~/.claude` and switches the logged-in account
in place, with no re-login, via `claude --accounts` (an interactive selector) or
`claude --account <name>`.

## Goals

- One `~/.claude`; swap account login in place, no browser re-login.
- `claude --accounts` -> arrow-key TUI selector; `claude --account <name>` -> direct.
- Add a new account through a guided browser login captured into a local vault.
- Cross-platform: Windows (PowerShell + cmd), macOS/Linux (bash/zsh).
- Install via `curl -fsSL <raw>/install.js | node`.

## Non-goals (v1, YAGNI)

- npm publish (curl|node only).
- Running two accounts simultaneously (that needs separate config dirs).
- OS keychain storage (tokens stay plaintext, same as Claude itself today).
- A standalone command name; the shadow `claude --accounts` is the only entry.

## Architecture — thin shell wrappers + Node core

All logic lives in one Node CLI. Per-shell wrappers only detect the account flags
and delegate to Node; everything else passes through to the real `claude`.

```
claude-accounts/
  install.js              # curl|node entry: detect OS+shells, fetch core, wire wrappers
  src/
    cli.js                # dispatch: menu | switch <n> | add | remove <n> | list | current
    vault.js              # ~/.claude/.accounts: slots, marker, oauthAccount injection
    switch.js             # save-current -> load-target -> marker
    menu.js               # raw-mode arrow TUI (ANSI), cross-platform
    login.js              # guided login: temp CLAUDE_CONFIG_DIR, spawn claude, capture
    claude-path.js        # resolve the real claude binary
  wrappers/
    claude.ps1.tmpl       # function for $PROFILE (Windows PowerShell)
    claude.cmd            # cmd shim (Windows)
    claude.sh.tmpl        # claude() function for bash/zsh (mac/Linux)
  docs/specs/             # design docs
  README.md  LICENSE  package.json
```

Install dir for the fetched core: `~/.claude-accounts/`.

## Data model — the vault

```
~/.claude/.accounts/
  <name>/
    credentials.json      # copy of .credentials.json (claudeAiOauth tokens)
    oauthAccount.json     # the oauthAccount object (email, accountUuid, org...)
  current                 # text: name of the account currently loaded in ~/.claude
```

Live account identity lives in two files that the switch swaps:
- `~/.claude/.credentials.json` — whole file (tokens).
- `~/.claude.json` -> `oauthAccount` key only (other ~43 keys preserved).

## Components

### vault.js
- `list()` -> account names (dirs under `.accounts`).
- `getCurrent()` / `setCurrent(name)` -> read/write `current` marker.
- `readSlot(name)` / `writeSlot(name, {credentials, oauthAccount})`.
- `injectOAuth(name)` -> write slot's oauthAccount into `~/.claude.json`, preserving
  all other keys (surgical JSON edit).
- `captureOAuth(name)` -> read `~/.claude.json.oauthAccount` into the slot.
- Atomic writes (temp + rename). Unix: `chmod 600` files, `700` dirs.

### switch.js — `switch(target)`
1. `current = getCurrent()`. If `target === current`, no-op (report "already").
2. If `current`: save live `.credentials.json` -> `slot(current)` and
   `captureOAuth(current)` (preserves refreshed tokens).
3. Load `slot(target)`: copy credentials -> `~/.claude/.credentials.json`;
   `injectOAuth(target)`.
4. `setCurrent(target)`.
5. Print "feche o Claude antes" guidance. Cannot enforce a closed Claude; document it.

### login.js — `add()`
1. Prompt for account name (reject existing / invalid).
2. `mkdtemp` a temp dir; `spawn(claude, { env: { CLAUDE_CONFIG_DIR: temp }, stdio: 'inherit' })`.
   User logs in via browser; process exits when done.
3. Read `temp/.credentials.json` + `temp/.claude.json.oauthAccount` -> `writeSlot(name)`.
4. If no credentials captured (user aborted), discard and report.
5. Always remove temp dir.

ASSUMPTION (verify in plan): launching `claude` with an empty `CLAUDE_CONFIG_DIR`
triggers OAuth and writes `.credentials.json` + `.claude.json` into that dir.

### menu.js — `menu()`
- Raw-mode (`process.stdin.setRawMode(true)`), reads Up/Down (and k/j), Enter, Esc.
- ANSI render; selected row highlighted; `*`/`(ativa)` marks current.
- Items: accounts + `[+] adicionar conta` + `[-] remover conta`.
- Returns a selection: an account name (-> switch), `add` (-> login flow then switch),
  or `remove` (-> pick + delete slot), or null (Esc -> cancel).

### claude-path.js
- Resolve the real `claude` binary, skipping our wrappers.
  - Unix: `command -v claude` run in a clean shell, or filter out `~/bin`.
  - Windows: search PATH for `claude.exe`, ignoring `~/bin\claude.cmd`.
- Persisted by the installer into `~/.claude-accounts/config.json` so wrappers read a
  fixed path and never recurse.

### cli.js
- Dispatch subcommands. `menu`/`switch`/`add` perform the action in-process and exit 0
  so the wrapper can then launch the real claude with remaining args.

## Shell wrappers

All wrappers: if first arg is `--accounts` or `--account`, run
`node ~/.claude-accounts/src/cli.js <menu|switch ...>`, then exec the real claude
with the remaining args; otherwise exec the real claude with all args.

- **PowerShell** (`$PROFILE`): `function claude { ... & $real @rest }`. Function shadows
  the external exe in PS.
- **cmd** (`~/bin/claude.cmd`, `~/bin` prepended to User PATH so it precedes the exe):
  routes flags to `node ~/.claude-accounts/src/cli.js`, forwards remaining args.
- **bash/zsh** (`~/.zshrc`, `~/.bashrc`): `claude() { ...; command claude "$rest"; }`.
  `command claude` bypasses the function to reach the real binary.

Real-claude path comes from `~/.claude-accounts/config.json` (written at install).

## install.js

1. Require Node >= 18 (warn < 22.5 only if a feature needs it; none here).
2. Fetch `src/*` and `wrappers/*` from GitHub raw into `~/.claude-accounts/`
   (ETag caching like XClaudeUsage; atomic writes).
3. Resolve real claude path; write `~/.claude-accounts/config.json`.
4. Detect shells present and install each wrapper, wrapping injected blocks in
   `# >>> claude-accounts >>>` ... `# <<< claude-accounts <<<` markers. Rewrite only
   our own block; back up the file first; refuse to clobber foreign config.
5. Windows: write `~/bin/claude.cmd`, prepend `~/bin` to User PATH if absent; add the
   PS function to `$PROFILE`.
6. Print: "open a new shell and run `claude --accounts`".

Idempotent and re-runnable. Never touches `.credentials.json`/`.claude.json` except
through the documented switch path.

## Security

- Tokens stored plaintext in `~/.claude/.accounts` — same exposure level as Claude's
  own `.credentials.json`. No new surface; README states this plainly.
- Unix: `chmod 600` vault files, `700` vault dir.
- Future (out of scope): OS keychain backend.

## Error handling

- Missing vault / no accounts -> clear message, exit non-zero.
- Switch target not in vault -> error, list available.
- `.claude.json` malformed -> abort switch, do not write.
- Add: temp login produced no creds -> discard, report, clean temp.
- All file writes atomic (temp + rename) to avoid half-written credential files.

## Testing

- **Unit:** vault slot read/write; `injectOAuth` preserves all non-oauthAccount keys;
  switch save/load round-trip. Use a temp `HOME` fixture.
- **Integration:** two fake accounts; switch back and forth; assert
  credentials + marker + oauthAccount track in lockstep.
- **Add/login:** mock `claude` binary (a fake script that writes creds into its
  `CLAUDE_CONFIG_DIR`) to test capture without real OAuth.
- **CI:** GitHub Actions matrix on windows/macos/linux running the test suite.

## Open questions (resolve during planning)

- Confirm empty-`CLAUDE_CONFIG_DIR` launch triggers login and writes the two files.
- Confirm `command claude` reliably reaches the real binary on zsh/bash when a
  `claude` function is defined.
