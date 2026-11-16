// A paused scene only needs a fresh image after a visible scene/state change.
// This leaves native gameplay VSync intact and does not infer device temperature.
export class RenderActivity {
  constructor() {
    this.paused = false;
    this.revision = -1;
    this.stateTick = -1;
  }

  shouldRender(hidden, paused, revision, stateTick) {
    if (hidden) {
      this.paused = false; // Always repaint once on foreground return.
      return false;
    }
    if (!paused) {
      this.paused = false;
      return true;
    }
    const changed = !this.paused || this.revision !== revision || this.stateTick !== stateTick;
    this.paused = true;
    this.revision = revision;
    this.stateTick = stateTick;
    return changed;
  }
}
