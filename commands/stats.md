# /adline:stats

Open your personal earnings dashboard.

```bash
ADLINE_DIR="${HOME}/.adline"
CONFIG="${ADLINE_DIR}/config.json"

if [ ! -f "$CONFIG" ]; then
  echo "adline is not set up yet. Run /adline:start first."
  exit 1
fi

TOKEN=$(node -e "const c=require('${CONFIG}'); console.log(c.token);")
echo "Your dashboard: https://adline.dev/me/${TOKEN}"
```
