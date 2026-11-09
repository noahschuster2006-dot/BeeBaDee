import { store, useStore } from "../store";

export function Help() {
  const ai = useStore((s) => s.aiEnabled);
  return (
    <div className="modal-wrap">
      <div className="panel modal">
        <button className="btn close" onClick={() => store.set({ panel: null })}>✕</button>
        <h2>How to play</h2>
        <h3>Moving around</h3>
        <div className="small">
          <b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>click</b> to capture the mouse and look around · <b>Esc</b> to release it · <b>right-drag</b> also looks around ·
          <b> mouse wheel</b> zoom · <b>C</b> switch first/third person · <b>E</b> interact (sit on chairs, mirror, quest board, desk, music box, dice tray, the game table) ·
          <b> 1–8</b> emotes · <b>Enter</b> chat
        </div>
        <h3>Voice</h3>
        <div className="small">Turn on <b>🎙️ Mic</b> to talk. Voices are 3D: people nearby are louder. <b>M</b> mutes, hold <b>V</b> to talk while muted is off.</div>
        <h3>The game board</h3>
        <div className="small">
          Press <b>Tab</b> or click the table. Your token has a white ring. Click a square to move (you'll see the path and distance). Click a creature to target it, then pick an attack or spell —
          or pick the attack first and then click the target. During combat you get movement, one action, one bonus action and one reaction per turn, shown above your actions. Press <b>Space</b> or <b>End turn</b> when you're done.
          Click a glowing object next to you to interact with it. <b>Alt+click</b> pings a square for everyone.
        </div>
        <h3>Talking to the Game Master</h3>
        <div className="small">
          {ai ? "The AI Game Master reads in-character (IC) chat. Just say what your character does or says: “I search the cart”, “I ask the snail about the bloom”." : "The scripted narrator follows the campaign script. Add ANTHROPIC_API_KEY on the server to get the AI Game Master."}
          {" "}When the GM asks for a check, a <b>Roll!</b> button appears at the top of the screen.
        </div>
        <h3>Chat commands</h3>
        <div className="small" style={{ fontFamily: "ui-monospace, monospace" }}>
          /r 1d20+5 Perception — roll dice<br />
          /r 2d20kh1+3 — advantage · /r 2d20kl1 — disadvantage<br />
          /gr 1d20 — secret roll only you see<br />
          /me draws her sword — describe an action<br />
          /gm Is the door locked? — ask the GM directly<br />
          /w Name message — whisper · /ooc message — out of character
        </div>
      </div>
    </div>
  );
}
