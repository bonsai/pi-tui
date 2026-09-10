# pi-tui

pi coding agent の TUI 拡張置き場。

## Extensions

### emoji-editor

`/emoji` で pi のヘッダー用絵文字アートエディタを開く。

```text
/emoji
```

| キー | 操作 |
|------|------|
| ↑↓←→ | カーソル移動 |
| Enter / Space / 左クリック | 絵文字配置 |
| Backspace / Delete / - / 右クリック | 削除 |
| 1-9, 0 | パレット選択 |
| c | 全消去 |
| ? | ヘルプ |
| ESC | 保存して終了 |
| q | 破棄 |

その他の絵文字を直接入力すれば、その絵文字を配置できる。

### lmstudio (着脱式)

LM Studio ローカルサーバーのロード済みモデルを動的登録する拡張。
pi 本体の設定 (`~/.pi/agent/`) から分離してあり、`bin/lmstudio.sh` で
**着脱**（attach/detach）できる。

| コマンド | 内容 |
|----------|------|
| `bin/lmstudio.sh on [model-id]` | 装着: `~/.pi/agent/extensions/lmstudio` へ symlink + `defaultProvider=lmstudio` |
| `bin/lmstudio.sh off` | 取り外し: symlink 除去 + `defaultProvider` をクラウド (sakura) に戻す |
| `bin/lmstudio.sh status` | 現在の状態を確認 |

`lmstudio.sh` はこのリポジトリが原本。外している間は pi 起動時に
LM Studio へ fetch しないため、サーバー未起動でもエラー警告が出ない。

> 環境変数 `PI_CLOUD_PROVIDER` / `PI_CLOUD_MODEL` で off 時の戻り先を、
> `PI_AGENT` で pi 設定ディレクトリを上書きできる。

## インストール

### emoji-editor

```bash
ln -s $(pwd)/extensions/emoji-editor.ts ~/.pi/agent/extensions/emoji-editor.ts
```

pi 内で `/reload` 後、`/emoji` を実行。

## 保存先

`~/.pi/agent/emoji-art.txt`
