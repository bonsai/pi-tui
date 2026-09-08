/**
 * emoji-editor: pi TUI 画面への絵文字追記エディタ
 * /emoji でフルスクリーン風キャンバスを開き、カーソル位置に絵文字を追記・削除できる。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ANSI_RE = /\x1b(?:\[[\d;]*[a-zA-Z]|\][^\x07]*\x07)/g;
const PASTE_RE = /\x1b\[200~|\x1b\[201~/g;

function sanitizeInput(data: string): string {
	return data.replace(PASTE_RE, "").replace(ANSI_RE, "");
}

function isSingleEmoji(data: string): boolean {
	if (data.length === 0) return false;
	// 改行・制御文字・空白を含む貼り付けごみを拒否
	if (/[\n\r\t\x00-\x1f\x7f\s]/.test(data)) return false;
	const width = visibleWidth(data);
	if (width < 1 || width > 4) return false;
	return /\p{Emoji}/u.test(data);
}

const SAVE_DIR = join(homedir(), ".pi/agent");
const SAVE_FILE = join(SAVE_DIR, "emoji-art.txt");

const PALETTE = [
	"🗝️", "🔑", "🏠", "🔌", "⭐", "❤️", "✨", "🎉", "🌟", "💡",
	"🔥", "🚀", "💻", "🤖", "🎨", "🎮", "🌈", "🌸", "🍀", "🌙",
];

const CANVAS_ROWS = 5;

interface Cell {
	emoji: string;
}

type Row = Map<number, Cell>; // col -> cell

interface ArtState {
	rows: Row[];
	cursorX: number;
	cursorY: number;
	selectedEmoji: string;
	width: number;
}

function loadState(): ArtState | undefined {
	if (!existsSync(SAVE_FILE)) return undefined;
	try {
		const raw = readFileSync(SAVE_FILE, "utf-8");
		const parsed = JSON.parse(raw) as ArtState;
		// Map を復元
		parsed.rows = parsed.rows.map((row) => new Map(Object.entries(row).map(([k, v]) => [Number(k), v])));
		// 壊れた selectedEmoji を復元
		if (!isSingleEmoji(parsed.selectedEmoji)) {
			parsed.selectedEmoji = PALETTE[0]!;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

function saveState(state: ArtState): void {
	const serializable = {
		...state,
		rows: state.rows.map((row) => Object.fromEntries(row)),
	};
	writeFileSync(SAVE_FILE, JSON.stringify(serializable, null, 2), "utf-8");
}

function renderRowsToStrings(rows: Row[], width: number): string[] {
	const out: string[] = [];
	for (let y = 0; y < CANVAS_ROWS; y++) {
		const row = rows[y] ?? new Map();
		let line = "";
		const cols = [...row.keys()].sort((a, b) => a - b);
		let lastCol = 0;
		for (const col of cols) {
			const cell = row.get(col);
			if (!cell) continue;
			const gap = Math.max(0, col - lastCol);
			line += " ".repeat(gap) + cell.emoji;
			lastCol = col + Math.max(1, visibleWidth(cell.emoji));
		}
		out.push(truncateToWidth(line, width));
	}
	return out;
}

class EmojiEditorComponent {
	private state: ArtState;
	private tui: { requestRender: () => void };
	private theme: any;
	private onClose: () => void;
	private cachedWidth = 0;
	private cachedLines: string[] = [];
	private cachedVersion = -1;
	private version = 0;
	private showHelp = false;

	constructor(
		tui: { requestRender: () => void },
		theme: any,
		onClose: () => void,
		saved?: ArtState,
	) {
		this.tui = tui;
		this.theme = theme;
		this.onClose = onClose;
		this.state = saved ?? {
			rows: Array.from({ length: CANVAS_ROWS }, () => new Map()),
			cursorX: 2,
			cursorY: 2,
			selectedEmoji: PALETTE[0]!,
			width: 80,
		};
	}

	private clampCursor(): void {
		this.state.cursorX = Math.max(0, Math.min(this.state.width - 1, this.state.cursorX));
		this.state.cursorY = Math.max(0, Math.min(CANVAS_ROWS - 1, this.state.cursorY));
	}

	private placeEmoji(): void {
		const row = this.state.rows[this.state.cursorY];
		if (!row) return;
		row.set(this.state.cursorX, { emoji: this.state.selectedEmoji });
		this.version++;
	}

	private deleteEmoji(): void {
		const row = this.state.rows[this.state.cursorY];
		if (!row) return;
		row.delete(this.state.cursorX);
		this.version++;
	}

	private renderRowWithCursor(
		y: number,
		width: number,
		fg: (color: string, s: string) => string,
		bg: (color: string, s: string) => string,
	): string {
		const row = this.state.rows[y] ?? new Map();
		let result = "";
		let col = 0;
		while (col < width) {
			const cell = row.get(col);
			const cursorHere = y === this.state.cursorY && col === this.state.cursorX;
			if (cell) {
				if (cursorHere) {
					result += bg("selectedBg", fg("accent", cell.emoji));
				} else {
					result += cell.emoji;
				}
				col += Math.max(1, visibleWidth(cell.emoji));
			} else if (cursorHere) {
				result += bg("selectedBg", fg("accent", this.state.selectedEmoji));
				col += Math.max(1, visibleWidth(this.state.selectedEmoji));
			} else {
				result += " ";
				col++;
			}
		}
		return truncateToWidth(result, width);
	}

	private selectByIndex(index: number): void {
		if (index >= 0 && index < PALETTE.length) {
			this.state.selectedEmoji = PALETTE[index]!;
			this.version++;
		}
	}

	handleMouse(event: TuiMouseEvent) {
		const canvasStartY = 2;
		const y = event.y - canvasStartY;
		if (event.type !== "click" || y < 0 || y >= CANVAS_ROWS || event.x < 0 || event.x >= this.state.width) {
			return undefined;
		}
		this.state.cursorX = event.x;
		this.state.cursorY = y;
		if (event.button === "left") {
			this.placeEmoji();
		} else if (event.button === "right") {
			this.deleteEmoji();
		}
		this.version++;
		this.tui.requestRender();
		return { handled: true };
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			saveState(this.state);
			this.onClose();
			return;
		}
		if (data === "q" || data === "Q") {
			this.onClose();
			return;
		}
		if (data === "?") {
			this.showHelp = !this.showHelp;
			this.version++;
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "up")) {
			this.state.cursorY--;
			this.clampCursor();
		} else if (matchesKey(data, "down")) {
			this.state.cursorY++;
			this.clampCursor();
		} else if (matchesKey(data, "left")) {
			this.state.cursorX--;
			this.clampCursor();
		} else if (matchesKey(data, "right")) {
			this.state.cursorX++;
			this.clampCursor();
		} else if (matchesKey(data, "enter") || data === " ") {
			this.placeEmoji();
		} else if (matchesKey(data, "backspace") || matchesKey(data, "delete")) {
			this.deleteEmoji();
		} else if (data >= "1" && data <= "9") {
			this.selectByIndex(Number(data) - 1);
		} else if (data === "0") {
			this.selectByIndex(9);
		} else if (data === "-") {
			this.state.cursorX = Math.max(0, this.state.cursorX - 1);
			this.deleteEmoji();
		} else if (data === "c" || data === "C") {
			for (const row of this.state.rows) {
				row.clear();
			}
		} else {
			// 入力された文字が単一絵文字なら直接配置
			const sanitized = sanitizeInput(data);
			if (isSingleEmoji(sanitized)) {
				this.state.selectedEmoji = sanitized;
				this.placeEmoji();
			} else {
				return; // 無視
			}
		}
		this.version++;
		this.tui.requestRender();
	}

	invalidate(): void {
		this.cachedWidth = 0;
	}

	render(width: number): string[] {
		this.state.width = width;
		if (width === this.cachedWidth && this.cachedVersion === this.version) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const fg = (color: string, s: string) => this.theme.fg(color, s);
		const bg = (color: string, s: string) => this.theme.bg(color, s);

		// タイトル
		lines.push(
			truncateToWidth(
				fg("accent", "🎨 emoji editor") + fg("muted", "  ? でヘルプ  |  ESC で保存終了  |  q で破棄"),
				width,
			),
		);
		lines.push("");

		// キャンバス行
		for (let y = 0; y < CANVAS_ROWS; y++) {
			lines.push(this.renderRowWithCursor(y, width, fg, bg));
		}

		lines.push("");

		// パレット
		let paletteLine = fg("muted", "パレット: ");
		for (let i = 0; i < PALETTE.length; i++) {
			const emoji = PALETTE[i]!;
			const label = i < 9 ? String(i + 1) : i === 9 ? "0" : `(${i + 1})`;
			if (emoji === this.state.selectedEmoji) {
				paletteLine += bg("selectedBg", `[${emoji}]`) + " ";
			} else {
				paletteLine += `${label}:${emoji} `;
			}
		}
		lines.push(truncateToWidth(paletteLine, width));

		// 現在位置
		lines.push(
			truncateToWidth(
				fg("dim", `cursor: (${this.state.cursorX}, ${this.state.cursorY})  selected: ${this.state.selectedEmoji}`),
				width,
			),
		);

		if (this.showHelp) {
			lines.push("");
			lines.push(fg("accent", "--- ショートカット ---"));
			lines.push(fg("text", "↑↓←→  カーソル移動"));
			lines.push(fg("text", "Enter/Space  選択中の絵文字を配置"));
			lines.push(fg("text", "Backspace/Delete/-  カーソル位置の絵文字を削除"));
			lines.push(fg("text", "1-9,0  パレットから絵文字を選択"));
			lines.push(fg("text", "直接絵文字を入力  その絵文字を配置"));
			lines.push(fg("text", "ESC  保存して終了"));
			lines.push(fg("text", "q    保存せず終了"));
		}

		this.cachedLines = lines;
		this.cachedWidth = width;
		this.cachedVersion = this.version;
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("emoji", {
		description: "pi TUI 画面用絵文字エディタを開く",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("emoji editor は対話モードのみです", "error");
				return;
			}

			const saved = loadState();

			await ctx.ui.custom((tui, theme, _kb, done) => {
				return new EmojiEditorComponent(
					tui,
					theme,
					() => done(undefined),
					saved,
				);
			});

			ctx.ui.notify(`絵文字アートを保存: ${SAVE_FILE}`, "info");
		},
	});

	pi.registerCommand("emoji-apply", {
		description: "保存した絵文字アートをヘッダーに適用",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") return;
			const saved = loadState();
			if (!saved) {
				ctx.ui.notify("絵文字アートが保存されていません。/emoji で作成", "warning");
				return;
			}
			const lines = renderRowsToStrings(saved.rows, saved.width);
			ctx.ui.setHeader((_tui, theme) => ({
				render(_w: number) {
					return ["", ...lines.map((l) => theme.fg("text", l)), ""];
				},
				invalidate() {},
			}));
			ctx.ui.notify("ヘッダーに絵文字アートを適用しました", "info");
		},
	});

	pi.registerCommand("emoji-off", {
		description: "絵文字ヘッダーを解除してデフォルトに戻す",
		handler: async (_args, ctx) => {
			ctx.ui.setHeader(undefined);
			ctx.ui.notify("デフォルトヘッダーに戻しました", "info");
		},
	});
}
