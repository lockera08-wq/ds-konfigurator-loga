// Zpět / vpřed nad snímky stavu (JSON-serializovatelné objekty).
export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.current = null;
  }

  /** Uloží nový stav; pokud je stejný jako aktuální, nic nedělá. */
  push(snapshot) {
    const json = JSON.stringify(snapshot);
    if (this.current !== null && json === this.current) return false;
    if (this.current !== null) this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = json;
    this.future = [];
    return true;
  }

  reset(snapshot) {
    this.past = [];
    this.future = [];
    this.current = snapshot ? JSON.stringify(snapshot) : null;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  undo() {
    if (!this.canUndo) return null;
    this.future.push(this.current);
    this.current = this.past.pop();
    return JSON.parse(this.current);
  }

  redo() {
    if (!this.canRedo) return null;
    this.past.push(this.current);
    this.current = this.future.pop();
    return JSON.parse(this.current);
  }
}
