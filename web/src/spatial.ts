export type Box = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * Uniform grid for planar broad-phase queries.
 *
 * Items spanning several cells are stored in each of them, so `query` may return
 * the same item more than once; callers that care must deduplicate.
 */
export class UniformGrid<T> {
  private readonly cells = new Map<string, T[]>();

  constructor(private readonly cellSize: number) {}

  private span(box: Box): [number, number, number, number] {
    const s = this.cellSize;
    return [
      Math.floor(box.minX / s),
      Math.floor(box.maxX / s),
      Math.floor(box.minY / s),
      Math.floor(box.maxY / s),
    ];
  }

  insert(box: Box, item: T): void {
    const [x0, x1, y0, y1] = this.span(box);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`;
        const cell = this.cells.get(key);
        if (cell) cell.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  query(box: Box, out: T[] = []): T[] {
    const [x0, x1, y0, y1] = this.span(box);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const cell = this.cells.get(`${x}:${y}`);
        if (!cell) continue;
        for (const item of cell) out.push(item);
      }
    }
    return out;
  }

  clear(): void {
    this.cells.clear();
  }
}
