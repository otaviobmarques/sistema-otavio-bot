# Teach-a-task: a recording becomes a skill

The fixture runs the real app against an isolated fake-engine server. A stand-in desktop bridge draws the screens and
speaks a scripted narration, so no screen, window or microphone of this computer is read.

```sh
export AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome   # only where agent-browser cannot download Chrome
export FAKE_CLAUDE_TEXT_ROUTES=/path/routes.json             # {"[teach-a-task]": "<the SKILL.md the fake answers>"}
export FAKE_CLAUDE_TEXT_LOG=/path/text-log.jsonl             # each one-off prompt, with the number of pictures it carried
node --experimental-strip-types scripts/control-omb.ts ui launch --entry teach
```

With the printed handle:

1. `ui eval --js "localStorage.setItem('omb-language','pt-br'); location.reload(); true"` for Portuguese.
2. Open the bot's profile, **Habilidades**, then **Ensinar uma tarefa a este bot**. The picker lists the drawn screen and
   windows, the narration box and the privacy line.
3. **Começar a gravar**, wait about 10 s, **Parar**, **Gerar skill**. `FAKE_CLAUDE_TEXT_LOG` holds one prompt starting
   with `[teach-a-task]`, carrying the narration and `images` > 0. The data folder's `teach/` directory is empty.
4. Edit the name and instructions, tick a second bot, **Salvar skill**.
5. `curl URL/api/bots/BOT/skills` lists the skill, enabled, with source `teach-a-task`, for each bot ticked; the
   Habilidades list shows it with "gravada por você (Teach-a-task)".

Interrupt the launcher with Ctrl-C to remove its data.

## What this does not prove

Real capture: `desktopCapturer` frames, the macOS Screen Recording prompt and Windows' window list need the packaged
desktop app. Real narration: the Mac speech helper and Fish Audio. A real Claude CLI reading the pictures over
`--input-format stream-json`; the fake CLI checks only the arguments and the message's shape.
