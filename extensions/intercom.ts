import { type ExtensionAPI, getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Box, type Component, Markdown, Spacer, Text, truncateToWidth } from "@earendil-works/pi-tui";

const CUSTOM_TYPE = "intercom";
// The quotes are optional: a shell strips them when the sender does not protect them.
const OPENING_TAG = /^<intercom from="?([^">\n]+)"?>\s*/;
const CLOSING_TAG = /\s*<\/intercom>\s*$/;
const PREVIEW_LINES = 5;
const SUMMARY_MAX_CHARS = 200;
const HERDR_TIMEOUT_MS = 2000;

type Envelope = { sender: string; body: string };
type IntercomMessage = { customType: string; content: string; display: boolean; details: { summary: string } };

export default function (pi: ExtensionAPI) {
	const undelivered: IntercomMessage[] = [];

	pi.on("input", (event, ctx) => {
		const envelope = parseEnvelope(event.text);
		const exitsWhenPromptReturns = ctx.mode === "print" || ctx.mode === "json";
		if (!envelope || event.images?.length || exitsWhenPromptReturns) return;

		const message: IntercomMessage = {
			customType: CUSTOM_TYPE,
			content: event.text,
			display: true,
			// pi-traceline shows the summary as the text of its one-line row.
			details: { summary: summarize(envelope) },
		};
		undelivered.push(message);
		pi.sendMessage(message, { triggerTurn: true, deliverAs: event.streamingBehavior });
		return { action: "handled" };
	});

	pi.on("message_start", ({ message }) => {
		if (message.role !== "custom" || message.customType !== CUSTOM_TYPE) return;
		const index = undelivered.findIndex((sent) => sent.content === message.content);
		if (index >= 0) undelivered.splice(index, 1);
	});

	// Pi drops its queued messages when the queue is cleared, which the TUI does before it aborts a run
	// and when the user restores the queue to the editor. Other modes keep the queue through an abort.
	pi.on("agent_settled", ({ aborted }, ctx) => {
		const piKeptItsQueue = aborted && ctx.mode !== "tui";
		if (piKeptItsQueue) return;
		for (const message of undelivered.splice(0)) pi.sendMessage(message, { triggerTurn: false });
	});

	pi.registerMessageRenderer(CUSTOM_TYPE, (message, { expanded, outputPad, keyHint }, theme) => {
		const envelope = parseEnvelope(typeof message.content === "string" ? message.content : "");
		if (!envelope) return undefined;

		const header = `${theme.fg("toolTitle", theme.bold("from"))} ${theme.fg("accent", envelope.sender)}`;
		const body = new Markdown(envelope.body, 0, 0, getMarkdownTheme(), {
			color: (line) => theme.fg("customMessageText", line),
		});
		const expandHint = (hiddenLines: number) =>
			`${theme.fg("muted", `... (${hiddenLines} more lines,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;

		const box = new Box(outputPad, 1, (line) => theme.bg("customMessageBg", line));
		box.addChild(new Text(header, 0, 0));
		box.addChild(new Spacer(1));
		box.addChild(expanded ? body : collapsed(body, expandHint));
		return box;
	});

	const herdrPaneId = process.env.HERDR_PANE_ID;
	if (herdrPaneId) {
		// The name is looked up for every run, because `herdr agent rename` can change it at any time.
		pi.on("before_agent_start", async (event) => {
			const sender = await herdrAgentName(pi, herdrPaneId);
			event.systemPromptOptions.sections.intercom = [
				`Message other agents with \`herdr agent prompt <name or pane ID> '<intercom from="${sender}">text</intercom>'\`.`,
				"Do not summarize these exchanges for the user.",
			].join("\n");
		});
	}
}

function parseEnvelope(text: string): Envelope | undefined {
	const opening = OPENING_TAG.exec(text);
	if (!opening) return undefined;
	return { sender: opening[1], body: text.slice(opening[0].length).replace(CLOSING_TAG, "") };
}

function summarize({ sender, body }: Envelope): string {
	const chars = [...body.replace(/\s+/g, " ").trim()];
	const start = chars.length > SUMMARY_MAX_CHARS ? `${chars.slice(0, SUMMARY_MAX_CHARS).join("")}…` : chars.join("");
	return `from ${sender}: ${start}`;
}

function collapsed(body: Component, expandHint: (hiddenLines: number) => string): Component {
	return {
		render(width) {
			const lines = body.render(width);
			const hiddenLines = lines.length - PREVIEW_LINES;
			if (hiddenLines <= 0) return lines;
			return [...lines.slice(0, PREVIEW_LINES), truncateToWidth(expandHint(hiddenLines), width, "...")];
		},
		invalidate() {
			body.invalidate();
		},
	};
}

async function herdrAgentName(pi: ExtensionAPI, paneId: string): Promise<string> {
	try {
		const { stdout } = await pi.exec("herdr", ["agent", "get", paneId], { timeout: HERDR_TIMEOUT_MS });
		const agent = JSON.parse(stdout).result.agent;
		return agent.name ?? agent.pane_id;
	} catch {
		return paneId;
	}
}
