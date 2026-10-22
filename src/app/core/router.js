export class Router {
  constructor() {
    this.routes = new Map();
    this.current = null;
  }

  register(name, view) {
    this.routes.set(name, view);
  }

  setCurrent(name) {
    if (!this.routes.has(name)) {
      throw new Error(`Route inconnue: ${name}`);
    }

    this.current = name;
    this.render();
  }

  render() {
    const root = document.getElementById('app-root') || document.body;

    for (const [name, view] of this.routes.entries()) {
      const el = root.querySelector(`[data-view="${name}"]`);
      if (el) {
        el.classList.toggle('active', name === this.current);
      }
    }

    if (typeof this.routes.get(this.current)?.render === 'function') {
      this.routes.get(this.current).render();
    }
  }
}
