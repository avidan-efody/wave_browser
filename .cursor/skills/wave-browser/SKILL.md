---
name: wave-browser
description: >-
  Start Wave Browser, open FSDB/KDB wave files, and manage the waveform viewer
  server. Use when the user asks to open a wave file, view signals, launch Wave
  Browser, open an FSDB, or run wave-browser commands.
---

# Wave Browser

Control the Wave Browser waveform viewer on the remote Linux machine. No npm or
local install is needed on the user's Windows laptop — everything runs on the
remote host and is accessed via VS Code port forwarding.

## Quick reference

| User request | Command |
|---|---|
| Open an FSDB file | `scripts/wave-browser.sh open-wave <path>` |
| Start the server | `scripts/wave-browser.sh start` |
| Check if running | `scripts/wave-browser.sh status` |
| Stop the server | `scripts/wave-browser.sh stop` |
| Build frontend (admin) | `scripts/wave-browser.sh build` |

All commands run from the repo root: `wave_browser_git/` (or your clone path)

## open-wave workflow

When the user asks to open/view a wave file (FSDB):

1. **Resolve the path** — use the absolute path on the remote machine. Expand
   `~` and verify the file exists with `test -f`.

2. **Run open-wave**:
   ```bash
   scripts/wave-browser.sh open-wave /path/to/waves.fsdb
   ```

   With an optional design database:
   ```bash
   scripts/wave-browser.sh open-wave /path/to/waves.fsdb --design-db /path/to/design.kdb
   ```

3. **Tell the user how to view it**:
   - The script prints a URL like `http://localhost:8000/?server=127.0.0.1:8000&fsdb=...`
   - With VS Code Remote SSH, port 8000 is auto-forwarded
   - Open via **Ports** panel → click the globe icon, or
   - `Ctrl+Shift+P` → **Simple Browser: Show** → paste the URL

4. **If build is missing**, run build first (requires `module load node/18.19.1`):
   ```bash
   /u/avidan/workspaces/wave_browser/scripts/wave-browser.sh build
   ```

## start workflow

When the user asks to start/launch Wave Browser without a specific file:

```bash
scripts/wave-browser.sh start
```

Then direct them to `http://localhost:8000/` via port forwarding.

Alternatively, VS Code task: **Terminal → Run Task → Wave Browser: Start Server**

## Troubleshooting

| Problem | Fix |
|---|---|
| "Frontend not built" | Run `scripts/wave-browser.sh build` once |
| Server won't start | Check `.wave-browser/server.log` |
| File not found | Path must exist on the **remote** Linux machine |
| Port in use | `scripts/wave-browser.sh stop` then restart |

## Future commands

This skill will gain more subcommands over time. Always prefer
`scripts/wave-browser.sh <command>` as the single entry point.
