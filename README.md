# Pi Intercom

Pi Intercom is a [Pi](https://pi.dev) extension for agents that message each other through [Herdr TUI](https://herdr.dev/tui/).
It shows messages from other agents as their own items in the transcript and tells each agent how to message the others.

## Install

```bash
pi install git:github.com/vadimtrifonov/pi-intercom
```

## How it works

An agent message is text in an envelope that names its sender:

```text
<intercom from="reviewer">The review is done.</intercom>
```

Herdr types the message into the recipient's terminal.
Input that starts with `<intercom from="<sender>">` becomes a custom message with `customType: "intercom"` instead of a user message.
The message starts a turn when the agent is idle and steers the current turn when it is busy.
A message that is still waiting when you abort the turn, or restore the queued messages to the editor, goes into the transcript without starting a turn.

Inside Herdr, where `HERDR_PANE_ID` is set, the extension adds a note to the system prompt that tells the agent how to send such a message with `herdr agent prompt`.
The sender is the agent's Herdr name, or its pane ID when it has no name.

## Limits

- The envelope counts only at the very start of the input, so a message that Herdr types after unsent text in the editor joins that text and stays a user message.
- A message sent to a busy agent does not appear among Pi's pending messages; it appears in the transcript when the agent takes it.

## Development

```bash
mise install    # Node
mise deps       # npm packages
mise run check  # type check
```
