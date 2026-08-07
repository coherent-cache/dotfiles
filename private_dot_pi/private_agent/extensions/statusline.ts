/**
 * Two-line footer: pi's stats/model layout plus the Claude Code host tag and
 * context progress bar.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR_WIDTH = 14;
// pi's own compaction default; overridden below by settings when present.
const DEFAULT_RESERVE_TOKENS = 16384;

const SGR: Record<string, string> = {
	black: "30",
	red: "31",
	green: "32",
	yellow: "33",
	blue: "34",
	magenta: "35",
	cyan: "36",
	white: "37",
	"bright-black": "90",
	"bright-red": "91",
	"bright-green": "92",
	"bright-yellow": "93",
	"bright-blue": "94",
	"bright-magenta": "95",
	"bright-cyan": "96",
	"bright-white": "97",
};

type AgentState = "idle" | "thinking" | "tool" | "compacting";

const STATE_STYLE: Record<AgentState, { glyph: string; color: ThemeColor }> = {
	idle: { glyph: "●", color: "dim" },
	thinking: { glyph: "◆", color: "accent" },
	tool: { glyph: "⚙", color: "warning" },
	compacting: { glyph: "⇲", color: "error" },
};

/** pi ships a palette keyed to reasoning effort; reuse it so themes stay coherent. */
const EFFORT_COLOR: Record<string, ThemeColor> = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
};

let agentState: AgentState = "idle";
let requestRender: (() => void) | null = null;

function setState(next: AgentState): void {
	if (agentState === next) return;
	agentState = next;
	requestRender?.();
}

/** chezmoi owns per-host identity; pi has no equivalent, so read it once. */
let nodeTag = hostname().split(".")[0];
let nodeAnsi = "\x1b[35m";
let identityLoaded = false;

function loadIdentity(onDone: () => void): void {
	if (identityLoaded) return;
	identityLoaded = true;
	execFile("chezmoi", ["data"], { timeout: 3000 }, (err, stdout) => {
		if (err) return;
		try {
			const data = JSON.parse(stdout);
			if (typeof data.nodeTag === "string" && data.nodeTag) nodeTag = data.nodeTag;
			const sgr = SGR[data.zmxColor];
			if (sgr) nodeAnsi = `\x1b[${sgr}m`;
			onDone();
		} catch {
			// keep hostname fallback
		}
	});
}

function reserveTokens(): number {
	for (const p of [join(process.cwd(), ".pi", "settings.json"), join(process.env.HOME ?? "", ".pi/agent/settings.json")]) {
		try {
			const v = JSON.parse(readFileSync(p, "utf8"))?.compaction?.reserveTokens;
			if (typeof v === "number" && v > 0) return v;
		} catch {
			// not configured at this layer
		}
	}
	return DEFAULT_RESERVE_TOKENS;
}

/**
 * ZMX_SESSION is inherited by detached/background agents from whatever pane
 * spawned them, so it only identifies *this* session when attached to a TTY.
 */
function hostLabel(): string {
	const explicit = process.env.STATUSLINE_SESSION;
	if (explicit) return `${nodeTag}·${explicit}`;
	const zmx = process.env.ZMX_SESSION;
	if (zmx && process.stdout.isTTY) return `${nodeTag}·${zmx}`;
	return nodeTag;
}

function fmtTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function shortenCwd(cwd: string): string {
	const home = process.env.HOME;
	let p = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	const parts = p.split("/");
	if (parts.length > 3) p = `…/${parts.slice(-2).join("/")}`;
	return p;
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_start", () => setState("thinking"));
	pi.on("agent_end", () => setState("idle"));
	pi.on("agent_settled", () => setState("idle"));
	pi.on("tool_execution_start", () => setState("tool"));
	pi.on("tool_execution_end", () => setState("thinking"));
	pi.on("session_before_compact", () => setState("compacting"));
	pi.on("session_compact", () => setState("idle"));

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());
			requestRender = () => tui.requestRender();
			loadIdentity(() => tui.requestRender());

			return {
				dispose() {
					requestRender = null;
					unsub();
				},
				invalidate() {},
				render(width: number): string[] {
					const totals: Usage = {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { total: 0 } as Usage["cost"],
					};
					let cost = 0;
					let hitRate: number | undefined;

					for (const entry of ctx.sessionManager.getBranch()) {
						let u: Usage | undefined;
						if (entry.type === "message" && entry.message.role === "assistant") {
							u = (entry.message as AssistantMessage).usage;
							const prompt = u.input + u.cacheRead + u.cacheWrite;
							hitRate = prompt > 0 ? (u.cacheRead / prompt) * 100 : undefined;
						} else if (entry.type === "message" && entry.message.role === "toolResult") {
							u = entry.message.usage;
						} else if (entry.type === "branch_summary" || entry.type === "compaction") {
							u = entry.usage;
						}
						if (!u) continue;
						totals.input += u.input;
						totals.output += u.output;
						totals.cacheRead += u.cacheRead;
						totals.cacheWrite += u.cacheWrite;
						cost += u.cost.total;
					}

					// Authoritative and compaction-aware; summing branch usage would
					// count every turn's prompt again and overstate the window.
					const usage = ctx.getContextUsage();
					const ctxWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const pct = usage?.percent ?? null;
					const usedPct = pct ?? 0;

					const tone = usedPct > 90 ? "error" : usedPct > 70 ? "warning" : "success";
					// Clamp inside the bar: on large windows the reserve is a thin
					// slice and the marker would round past the last cell.
					const markerAt =
						ctxWindow > 0
							? Math.min(
									BAR_WIDTH - 1,
									Math.max(0, Math.round(((ctxWindow - reserveTokens()) / ctxWindow) * BAR_WIDTH)),
								)
							: -1;

					let bar = "";
					const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round((usedPct / 100) * BAR_WIDTH)));
					for (let i = 0; i < BAR_WIDTH; i++) {
						if (i === markerAt) bar += theme.fg("dim", "┃");
						bar += i < filled ? theme.fg(tone, "█") : theme.fg("dim", "░");
					}

					const pctText = pct === null ? "?" : `${usedPct.toFixed(0)}%`;
					const stats = [
						`${bar} ${theme.fg(tone, pctText)}`,
						theme.fg("dim", `${fmtTokens(ctxWindow)}`),
					];
					if (totals.input) stats.push(`${theme.fg("dim", "↑")}${fmtTokens(totals.input)}`);
					if (totals.output) stats.push(`${theme.fg("dim", "↓")}${fmtTokens(totals.output)}`);
					if (totals.cacheRead) stats.push(theme.fg("dim", `R${fmtTokens(totals.cacheRead)}`));
					if (totals.cacheWrite) stats.push(theme.fg("dim", `W${fmtTokens(totals.cacheWrite)}`));
					if (hitRate !== undefined && (totals.cacheRead || totals.cacheWrite)) {
						// A cold cache is the expensive state, so flag it like one.
						const chTone: ThemeColor = hitRate >= 80 ? "success" : hitRate >= 40 ? "warning" : "error";
						stats.push(theme.fg(chTone, `CH${hitRate.toFixed(0)}%`));
					}
					if (cost) stats.push(theme.fg("warning", `$${cost.toFixed(3)}`));

					const effort = ctx.model?.reasoning ? (ctx.thinkingLevel ?? "off") : undefined;
					const right =
						theme.fg("accent", ctx.model?.id ?? "no-model") +
						(effort ? theme.fg(EFFORT_COLOR[effort] ?? "dim", ` • ${effort}`) : "");

					const sep = theme.fg("dim", " │ ");
					const branch = footerData.getGitBranch();
					// pi's default footer shows this; replacing the footer dropped it.
					const sessionName = ctx.sessionManager.getSessionName();
					const state = STATE_STYLE[ctx.isIdle() && agentState === "thinking" ? "idle" : agentState];
					const head =
						theme.fg(state.color, state.glyph) +
						" " +
						nodeAnsi +
						"\x1b[1m" +
						hostLabel() +
						"\x1b[0m" +
						sep +
						theme.fg("accent", shortenCwd(ctx.cwd)) +
						(branch ? theme.fg("dim", ` (${branch})`) : "") +
						(sessionName ? theme.fg("dim", " • ") + theme.fg("accent", sessionName) : "") +
						(ctx.isProjectTrusted() ? "" : theme.fg("warning", " ⚠ untrusted"));

					const left = stats.join(" ");
					const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
					return [truncateToWidth(head, width), truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});
}
