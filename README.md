# adline

Earn 50% rev-share on ads shown in your Claude Code statusline.

No tracking. No code reads. Just a tiny sponsored message while you wait.

## Install

```bash
claude plugin marketplace add adline/adline
```

Or manually:

```bash
git clone https://github.com/adline/adline ~/.claude/plugins/adline
bash ~/.claude/plugins/adline/setup.sh
```

Then restart Claude Code.

## How it works

- adline patches one line in `~/.claude/settings.json` (the `statusLine` hook)
- Claude Code calls `statusline.js` every ~300ms and renders the first line of stdout below your prompt
- `statusline.js` reads an ad from a local cache file — no network calls in the hot path
- A background worker (`sync.js`) refreshes the ad every 60s and uploads anonymous impression counts
- You earn 50% of ad revenue pro-rated by impressions

## Privacy

- Never reads your code, files, or project paths
- Never reads Claude Code's session input/output
- Only sends: anonymous user ID + impression counts
- Opt out anytime: `bash ~/.claude/plugins/adline/teardown.sh`

## Earnings

After install, your personal dashboard:

```bash
cat ~/.adline/config.json  # find your token
# then visit https://adline.dev/me/<token>
```

## Uninstall

```bash
bash ~/.claude/plugins/adline/teardown.sh
rm -rf ~/.claude/plugins/adline ~/.adline
```

## Advertise

Self-serve at [adline.dev/advertise](https://adline.dev/advertise).  
Starting from $X/month. Founding Sponsor slots available.

## License

MIT
