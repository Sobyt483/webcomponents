import { type Page, expect } from '@playwright/test';

export interface SavedCard {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  [key: string]: unknown;
}

export interface SavedPayload {
  sections: unknown[];
  cards: SavedCard[];
}

/**
 * Reset the captured saved payload. The fixture wires the element's `saved`
 * output to `window.__mfpSaved`; nulling it lets a subsequent readSaved poll
 * distinguish a fresh emit from a stale one.
 */
export async function resetSaved(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __mfpSaved: unknown }).__mfpSaved = null;
  });
}

/**
 * Click the dashboard Save button (testid dashboard-save-btn) to commit the
 * edit and emit the `saved` event.
 */
export async function saveEdit(page: Page): Promise<void> {
  await page.locator('[data-testid="dashboard-save-btn"]').click();
}

/**
 * Poll for the saved payload captured from the `saved` CustomEvent
 * (e.detail = { sections, cards }).
 */
export async function readSaved(page: Page): Promise<SavedPayload> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __mfpSaved: unknown }).__mfpSaved !== null,
      ),
    )
    .toBe(true);

  return page.evaluate(
    () => (window as unknown as { __mfpSaved: SavedPayload }).__mfpSaved,
  );
}

/**
 * Find a card by id within a saved payload. Throws if not present.
 */
export function savedCard(payload: SavedPayload, id: string): SavedCard {
  const card = payload.cards.find((c) => c.id === id);
  if (!card) throw new Error(`Card ${id} not found in saved payload`);
  return card;
}
