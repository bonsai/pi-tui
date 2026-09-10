#!/usr/bin/env bash
# bin/lmstudio.sh — LM Studio 連携を pi に着脱（attach/detach）する
#
#   lmstudio.sh on  [model-id]   装着: symlink 作成 + defaultProvider=lmstudio
#   lmstudio.sh off              取り外し: symlink 除去 + クラウドへ戻す
#   lmstudio.sh status           現在の状態を表示
#
# 環境変数で上書き可:
#   PI_AGENT            pi 設定ディレクトリ (default: ~/.pi/agent)
#   PI_CLOUD_PROVIDER   off 時に戻すプロバイダ (default: sakura)
#   PI_CLOUD_MODEL      off 時に戻すモデル     (default: preview/Kimi-K2.7-Code)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_DIR/extensions/lmstudio"
PI_AGENT="${PI_AGENT:-$HOME/.pi/agent}"
LINK="$PI_AGENT/extensions/lmstudio"
SETTINGS="$PI_AGENT/settings.json"

CLOUD_PROVIDER="${PI_CLOUD_PROVIDER:-sakura}"
CLOUD_MODEL="${PI_CLOUD_MODEL:-preview/Kimi-K2.7-Code}"

json_set() { # json_set <key> <value>
  local key="$1" value="$2"
  python3 - "$SETTINGS" "$key" "$value" <<'EOF'
import json, sys
path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
doc = json.load(open(path))
doc[key] = value
with open(path, "w") as f:
    json.dump(doc, f, indent=2, ensure_ascii=False)
    f.write("\n")
EOF
}

json_get() { # json_get <key>
  python3 - "$SETTINGS" "$1" <<'EOF' || echo "?"
import json, sys
try:
    print(json.load(open(sys.argv[1])).get(sys.argv[2], "?"))
except Exception:
    print("?")
EOF
}

command -v python3 >/dev/null || { echo "ERR: python3 が見つかりません"; exit 1; }

case "${1:-status}" in
  on)
    [[ -d "$SRC" ]] || { echo "ERR: $SRC がありません (このリポジトリ内に lmstudio 拡張が無い)"; exit 1; }
    if [[ -e "$LINK" && ! -L "$LINK" ]]; then
      echo "ERR: $LINK は実ディレクトリです。退避・削除してから再実行してください"
      exit 1
    fi
    mkdir -p "$PI_AGENT/extensions"
    ln -sfn "$SRC" "$LINK"
    json_set defaultProvider lmstudio
    if [[ -n "${2:-}" ]]; then json_set defaultModel "$2"; fi
    echo "attached: lmstudio"
    echo "  defaultProvider=lmstudio  /  defaultModel=$(json_get defaultModel)"
    echo "  LM Studio を起動 → Developer > Start Server → pi を再起動 (/model で選択可)"
    ;;
  off)
    if [[ -L "$LINK" ]]; then
      rm "$LINK"
      echo "detached: $LINK を除去しました"
    elif [[ -e "$LINK" ]]; then
      echo "ERR: $LINK は実ディレクトリです。rm -rf で明示削除してください"
      exit 1
    else
      echo "already detached"
    fi
    json_set defaultProvider "$CLOUD_PROVIDER"
    json_set defaultModel "$CLOUD_MODEL"
    echo "  defaultProvider=$CLOUD_PROVIDER  /  defaultModel=$CLOUD_MODEL"
    ;;
  status)
    echo "=== pi x LM Studio ==="
    if [[ -L "$LINK" ]]; then
      echo "state    : attached (-> $(readlink "$LINK"))"
    elif [[ -e "$LINK" ]]; then
      echo "state    : real-dir (スクリプト管理外)"
    else
      echo "state    : detached"
    fi
    echo "provider : $(json_get defaultProvider)"
    echo "model    : $(json_get defaultModel)"
    ;;
  *)
    echo "usage: lmstudio.sh <on [model-id]|off|status>"
    exit 1
    ;;
esac