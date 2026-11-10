import { store, useStore } from "../store";

export function Help({ onClose }: { onClose?: () => void } = {}) {
  const close = onClose ?? (() => store.set({ panel: null }));
  const ai = useStore((s) => s.aiEnabled);
  return (
    <div className="modal-wrap">
      <div className="panel modal">
        <button className="btn close" onClick={close}>✕</button>
        <h2>How to play</h2>
        <h3>Moving around</h3>
        <div className="small">
          <b>WASD</b> move · <b>Shift</b> run · <b>Space</b> jump · <b>click</b> to capture the mouse and look around · <b>Esc</b> to release it · <b>right-drag</b> also looks around ·
          <b> mouse wheel</b> zoom · <b>C</b> switch first/third person · <b>E</b> interact (sit on chairs, mirror, quest board, desk, music box, dice tray, the game table) ·
          <b> 1–8</b> emotes · <b>Enter</b> chat · <b>I</b> your pack · <b>M</b> world map · <b>K</b> character sheet · <b>Esc</b> menu (save, invite, settings)
        </div>
        <h3>Voice</h3>
        <div className="small">Turn on <b>🎙️ Mic</b> to talk. Voices are 3D: people nearby are louder. <b>N</b> mutes, hold <b>V</b> to talk while muted is off.</div>
        <h3>The game board</h3>
        <div className="small">
          Press <b>Tab</b> or click the table. Your token has a white ring. Click a square to move (you'll see the path and distance). Click a creature to target it, then pick an attack or spell —
          or pick the attack first and then click the target. During combat you get movement, one action, one bonus action and one reaction per turn, shown above your actions. Press <b>Space</b> or <b>End turn</b> when you're done.
          Click a glowing object next to you to interact with it. <b>Alt+click</b> pings a square for everyone.
          On your turn you can also step your hero with <b>WASD / arrow keys</b> (<b>Q E Z X</b> for diagonals) while the board is open, or walk up to the table, aim at a square and <b>click</b> to move your miniature there.
        </div>
        <h3>Sight lines</h3>
        <div className="small">
          Walls, trees, rocks, pillars and closed doors block line of sight; tall grass, rubble and junk (<i>brush</i>) block sight but can be crossed at double cost.
          Squares nobody in the party has seen stay blank, and enemies out of sight are hidden from you, so scout ahead before you charge in.
        </div>
        <h3>Travel, exploring and saves</h3>
        <div className="small">
          Moving between places on the world map rolls a d20 for the road: a quiet trip, a fight on a terrain map, a stranger who needs a decision, or a landmark such as a wizard's tower. The host can also <b>🧭 Explore the wilds</b> from the map for extra adventures, and the party returns right where it left off.
          Tables save themselves in the host's browser. Use <b>Esc → Save / Download save file</b> to keep a copy, and <b>Continue</b> on the start menu to pick a game back up (or import a save file).
        </div>
        <h3>Settings</h3>
        <div className="small">The ⚙️ button changes mouse sensitivity, field of view, first/third person, ink outlines, hatching, quality and volume. Choices are saved in your browser.</div>
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
