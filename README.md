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

## インストール

```bash
ln -s $(pwd)/extensions/emoji-editor.ts ~/.pi/agent/extensions/emoji-editor.ts
```

pi 内で `/reload` 後、`/emoji` を実行。

## 保存先

`~/.pi/agent/emoji-art.txt`
