# claude-accounts

Switch the logged-in Claude Code account in a single `~/.claude` — no browser re-login.

## Install
```
curl -fsSL https://raw.githubusercontent.com/SrDarf/claude-accounts/main/install.js | node
```
Open a new shell, then:
```
claude --accounts        # arrow-key selector
claude --account work    # switch directly, then launches Claude
```

## Adding an account
Choose `[+] adicionar conta` in the selector. A guided browser login runs in a temporary
config dir; the resulting credentials are stored in the vault. No tokens are typed by hand.

## How it works
Each account's `.credentials.json` + `oauthAccount` are stored under
`~/.claude/.accounts/<name>/`. Switching saves the current login back to its slot (keeping
refreshed tokens), then loads the target into `~/.claude/.credentials.json` and
`~/.claude.json`. Always close Claude before switching.

## Security
Tokens are stored in plaintext under `~/.claude/.accounts` — the same exposure level as
Claude Code's own `~/.claude/.credentials.json`. No new attack surface.

## License
MIT
