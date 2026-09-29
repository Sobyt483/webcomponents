import { type Slot, slotOf } from './grid';
import { type Page, expect } from '@playwright/test';

/**
 * Focus a card's grid-item host. The dashboard's keyboard handler only acts
 * when the event target IS the grid-item host (event.target === currentTarget),
 * so focus must land on the `.grid-stack-item` element itself, which carries
 * tabindex=0 / role=listitem in edit mode.
 */
export async function focusCard(page: Page, id: string): Promise<void> {
  const host = page.locator(`.grid-stack-item[gs-id="${id}"]`);
  await expect(host).toBeVisible();
  await host.focus();
}

/**
 * Focus a card host, press a keyboard command, and (optionally) wait for an
 * expected slot change. Commands are the same key combos the dashboard parses:
 *   Shift+Arrow{Left,Right}   -> resize by one stepped width
 *   Control+Arrow{Left,Right} -> move / reorder
 *   Control+Home / Control+End -> move to row start / end
 *
 * When `expected` is provided, polls until the card's slot matches (a partial
 * match — only the provided keys are compared).
 */
export async function pressCommand(
  page: Page,
  id: string,
  keys: string,
  expected?: Partial<Slot>,
): Promise<void> {
  await focusCard(page, id);
  await page.keyboard.press(keys);

  if (expected) {
    await expect
      .poll(async () => {
        const slot = await slotOf(page, id);
        return Object.entries(expected).every(
          ([k, v]) => slot[k as keyof Slot] === v,
        );
      })
      .toBe(true);
  } else {
    // Give the queued microtask (focus restore + grid change) time to settle.
    await page.waitForTimeout(50);
  }
}
