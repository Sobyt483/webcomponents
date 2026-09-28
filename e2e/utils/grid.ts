import { type Page } from '@playwright/test';

/**
 * z-flow grid cell height in px (CELL_HEIGHT constant). gs-y is expressed in
 * grid-row units, each row = 10px.
 */
export const CELL_HEIGHT = 10;

/**
 * Read the current CSS-var width (--gs-w) of a card. Returns 1 when the var
 * is absent (gridstack omits it for single-column cards).
 */
export async function getWidth(page: Page, id: string): Promise<number> {
  return page.evaluate((cardId) => {
    const el = document.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="${cardId}"]`,
    );
    if (!el) throw new Error(`Card ${cardId} not found`);
    const raw = getComputedStyle(el).getPropertyValue('--gs-w').trim();
    return raw ? parseInt(raw, 10) : 1;
  }, id);
}

/**
 * Read the current CSS-var height (--gs-h) of a card. Returns 1 when the var
 * is absent.
 */
export async function getHeight(page: Page, id: string): Promise<number> {
  return page.evaluate((cardId) => {
    const el = document.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="${cardId}"]`,
    );
    if (!el) throw new Error(`Card ${cardId} not found`);
    const raw = getComputedStyle(el).getPropertyValue('--gs-h').trim();
    return raw ? parseInt(raw, 10) : 1;
  }, id);
}

/**
 * Return card ids sorted by their live DOM position: primary sort by gs-y
 * (row), secondary by gs-x (column). This is the z-flow visual order.
 *
 * When `ids` is omitted the function derives the set from the live DOM (any
 * [gs-id] element), so it is not coupled to the fixture roster — new cards
 * added during a test are included automatically.
 */
export async function orderByDom(page: Page, ids?: string[]): Promise<string[]> {
  return page.evaluate((knownIds) => {
    let elements: Element[];
    if (knownIds) {
      elements = knownIds
        .map((id) => document.querySelector(`.grid-stack-item[gs-id="${id}"]`))
        .filter((el): el is Element => el !== null);
    } else {
      elements = Array.from(document.querySelectorAll('.grid-stack-item[gs-id]'));
    }

    return elements
      .map((el) => ({
        id: el.getAttribute('gs-id')!,
        y: parseInt(el.getAttribute('gs-y') ?? '0', 10),
        x: parseInt(el.getAttribute('gs-x') ?? '0', 10),
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((c) => c.id);
  }, ids ?? null);
}

export interface GridBox {
  x: number;
  y: number;
  width: number;
  height: number;
  colWidth: number;
  columns: number;
}

/**
 * Bounding box of the grid container plus the derived per-column width. The
 * z-flow grid is a 4-column layout at the 1280px harness viewport.
 */
export async function gridBox(page: Page): Promise<GridBox> {
  const grid = page.locator('[data-testid="dashboard-grid"]');
  const box = await grid.boundingBox();
  if (!box) throw new Error('Grid container not found');

  // Column count is read from the live grid so the math tracks the real layout.
  const columns = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="dashboard-grid"]');
    const attr = el?.getAttribute('gs-column');
    return attr ? parseInt(attr, 10) : 4;
  });

  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    colWidth: box.width / columns,
    columns,
  };
}

export interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Read a card's grid slot from its DOM attributes / CSS vars. gs-x / gs-y are
 * attributes; gs-w / gs-h are ABSENT when the value is 1, so width/height fall
 * back to the --gs-w / --gs-h CSS custom properties (default 1).
 */
export async function slotOf(page: Page, id: string): Promise<Slot> {
  return page.evaluate((cardId) => {
    const el = document.querySelector<HTMLElement>(
      `.grid-stack-item[gs-id="${cardId}"]`,
    );
    if (!el) throw new Error(`Card ${cardId} not found`);

    const attrInt = (name: string, fallback: number) => {
      const raw = el.getAttribute(name);
      return raw !== null ? parseInt(raw, 10) : fallback;
    };
    const varInt = (name: string, fallback: number) => {
      const raw = getComputedStyle(el).getPropertyValue(name).trim();
      return raw ? parseInt(raw, 10) : fallback;
    };

    return {
      x: attrInt('gs-x', 0),
      y: attrInt('gs-y', 0),
      w: varInt('--gs-w', 1),
      h: varInt('--gs-h', 1),
    };
  }, id);
}
