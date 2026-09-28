import { expect, test } from '@playwright/test';
import { getWidth, orderByDom, slotOf } from '../utils/grid';
import { openHarness, enterEditMode } from '../utils/harness';
import { focusCard, pressCommand } from '../utils/keyboard';
import { readSaved, resetSaved, saveEdit, savedCard } from '../utils/saved';

test.describe('Keyboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('edit mode adds tabindex, role=listitem and aria-keyshortcuts to grid-item hosts', async ({
    page,
  }) => {
    await enterEditMode(page);

    // The grid container should have role=list in zFlow edit mode.
    await expect(
      page.locator('[data-testid="dashboard-grid"][role="list"]'),
    ).toBeVisible();

    // At least one card host should have the expected ARIA attributes.
    const host = page.locator('.grid-stack-item[gs-id="e2e-a"]');
    await expect(host).toHaveAttribute('tabindex', '0');
    await expect(host).toHaveAttribute('role', 'listitem');
    await expect(host).toHaveAttribute('aria-keyshortcuts');
  });

  test('Shift+ArrowRight grows e2e-a: 1 → 2 → 4', async ({ page }) => {
    await enterEditMode(page);

    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(1);

    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 2 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(2);

    // Next allowed step from 2 for maxW=4 is 4.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 4 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);
  });

  test('Shift+ArrowLeft shrinks e2e-a: 4 → 2 → 1', async ({ page }) => {
    await enterEditMode(page);

    // First grow to 4.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 2 });
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 4 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);

    // Shrink 4 → 2.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowLeft', { w: 2 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(2);

    // Shrink 2 → 1.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowLeft', { w: 1 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(1);
  });

  test('e2e-b: Shift+ArrowRight no-op — pinned by effectiveMax (columns - x), not its own maxW', async ({
    page,
  }) => {
    await enterEditMode(page);

    // e2e-b starts at w=2.
    await expect.poll(() => getWidth(page, 'e2e-b')).toBe(2);

    // NOTE — this asserts the effectiveMax clamp, NOT e2e-b's configured maxW
    // (keyboard has no pixel math, so it is deterministic). e2e-b is configured
    // maxW=3, but the XL width-swap rewrites its runtime maxW to 4 (see the
    // BASELINE test in resize-constraints.e2e.ts), and z-flow packs it at x=1
    // (behind e2e-a at x=0). Its effective max = columns - x = 4 - 1 = 3, so the
    // allowed stepped widths are [1,2,4] filtered ≤ 3 => [1,2]. Starting at 2
    // (top of the ladder), a grow command finds no larger allowed width and is a
    // no-op. The invariant: the width stays pinned at 2. Real per-card maxW
    // clamping is covered by the e2e-d resize test (maxW=2).
    const widthBefore = await getWidth(page, 'e2e-b');
    expect(widthBefore).toBe(2);

    await focusCard(page, 'e2e-b');
    await page.keyboard.press('Shift+ArrowRight');

    // Allow the microtask to settle; the width must remain unchanged.
    await expect.poll(() => getWidth(page, 'e2e-b')).toBe(widthBefore);
  });

  test('Control+ArrowRight swaps front card with its right neighbour', async ({
    page,
  }) => {
    await enterEditMode(page);

    // Read the live DOM order first — initial order is non-deterministic, so we
    // work relative to positions, not hardcoded ids.
    const orderBefore = await orderByDom(page);
    const front = orderBefore[0];
    const second = orderBefore[1];

    // Move front card right: z-flow swaps it with its right neighbour.
    await pressCommand(page, front, 'Control+ArrowRight');

    // Poll for the order to update in the DOM.
    await expect
      .poll(() => orderByDom(page))
      .toEqual([second, front, ...orderBefore.slice(2)]);
  });

  test('Control+ArrowLeft restores order after a right move', async ({
    page,
  }) => {
    await enterEditMode(page);

    const orderBefore = await orderByDom(page);
    const front = orderBefore[0];
    const second = orderBefore[1];

    // Move right then back left — net effect: order is restored.
    await pressCommand(page, front, 'Control+ArrowRight');
    await expect
      .poll(() => orderByDom(page))
      .toEqual([second, front, ...orderBefore.slice(2)]);

    await pressCommand(page, front, 'Control+ArrowLeft');
    await expect
      .poll(() => orderByDom(page))
      .toEqual(orderBefore);
  });

  test('Control+End moves front card to the last slot in its row', async ({
    page,
  }) => {
    await enterEditMode(page);

    // With 5 cards (widths 1+2+2+1+1=7) packed into 4 cols, row 0 holds
    // some subset. Read the live row-0 cards, then move the front to the end.
    const orderBefore = await orderByDom(page);
    const front = orderBefore[0];

    // Identify row-0 cards before the move.
    const row0Before = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll<HTMLElement>('.grid-stack-item[gs-id]'),
      )
        .filter((el) => parseInt(el.getAttribute('gs-y') ?? '99', 10) === 0)
        .map((el) => el.getAttribute('gs-id')!);
    });

    await pressCommand(page, front, 'Control+End');

    // After Ctrl+End the front card should be in the same row but at the
    // rightmost position (i.e. the last in the row by gs-x). Assert that
    // front's row-0 neighbours have reflowed and front sits last in row 0.
    await expect
      .poll(async () => {
        const row0After = await page.evaluate(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>('.grid-stack-item[gs-id]'),
          )
            .filter(
              (el) => parseInt(el.getAttribute('gs-y') ?? '99', 10) === 0,
            )
            .sort(
              (a, b) =>
                parseInt(a.getAttribute('gs-x') ?? '0', 10) -
                parseInt(b.getAttribute('gs-x') ?? '0', 10),
            )
            .map((el) => el.getAttribute('gs-id')!),
        );
        // front must be the last card in row 0 (highest gs-x).
        return row0After[row0After.length - 1] === front;
      })
      .toBe(true);

    // Sanity: front started at row 0 so Ctrl+End is non-trivial only when row 0
    // has more than one card. If it was already alone, the test is vacuous but
    // harmless — front stays at x:0.
    if (row0Before.length > 1) {
      const slotAfter = await slotOf(page, front);
      expect(slotAfter.x).toBeGreaterThan(0);
    }
  });

  test('Control+Home on a row-start card is a no-op (order unchanged)', async ({
    page,
  }) => {
    await enterEditMode(page);

    // Ensure the front card is at row-start (x:0) — it always is at y:0, x:0.
    const orderBefore = await orderByDom(page);
    const front = orderBefore[0];
    const slotBefore = await slotOf(page, front);
    expect(slotBefore.x).toBe(0); // invariant: front card starts at x:0

    // Ctrl+Home on a row-start card must be a no-op.
    await pressCommand(page, front, 'Control+Home');

    // Neither order nor position should change.
    await expect.poll(() => orderByDom(page)).toEqual(orderBefore);
    const slotAfter = await slotOf(page, front);
    expect(slotAfter.x).toBe(slotBefore.x);
    expect(slotAfter.y).toBe(slotBefore.y);
  });

  test('Control+ArrowDown moves front card to row 1 x:0; neighbours reflow up', async ({
    page,
  }) => {
    await enterEditMode(page);

    const orderBefore = await orderByDom(page);
    const front = orderBefore[0];
    const slotFrontBefore = await slotOf(page, front);
    expect(slotFrontBefore.y).toBe(0); // front must start at row 0

    // The card immediately after front in order fills its vacated slot.
    const second = orderBefore[1];

    await pressCommand(page, front, 'Control+ArrowDown');

    // After Ctrl+Down, the formerly-front card must be at a higher y (row 1).
    await expect
      .poll(async () => {
        const s = await slotOf(page, front);
        return s.y > 0;
      })
      .toBe(true);

    // The second card (or some card) should now be at y:0 (reflowed up).
    await expect
      .poll(async () => {
        const s = await slotOf(page, second);
        return s.y === 0;
      })
      .toBe(true);

    // The overall order must have changed: front is no longer first.
    const orderAfter = await orderByDom(page);
    expect(orderAfter[0]).not.toBe(front);
  });

  test('Control+ArrowUp on a row-0 card is a no-op (order unchanged)', async ({
    page,
  }) => {
    await enterEditMode(page);

    const orderBefore = await orderByDom(page);
    const front = orderBefore[0];
    const slotBefore = await slotOf(page, front);
    expect(slotBefore.y).toBe(0); // invariant: front card is in row 0

    // Ctrl+Up on a row-0 card must be a no-op.
    await pressCommand(page, front, 'Control+ArrowUp');

    // Order and slot must be unchanged.
    await expect.poll(() => orderByDom(page)).toEqual(orderBefore);
    const slotAfter = await slotOf(page, front);
    expect(slotAfter.x).toBe(slotBefore.x);
    expect(slotAfter.y).toBe(slotBefore.y);
  });

  test('two-modifier no-op: Control+Shift+ArrowRight does not change width', async ({
    page,
  }) => {
    await enterEditMode(page);

    const widthBefore = await getWidth(page, 'e2e-a');

    // isOnlyModifier check means two modifiers together = no command parsed.
    await focusCard(page, 'e2e-a');
    await page.keyboard.press('Control+Shift+ArrowRight');

    // Width must remain unchanged.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(widthBefore);
  });

  test('focus-guard: command on blurred host is ignored', async ({ page }) => {
    await enterEditMode(page);

    const widthBefore = await getWidth(page, 'e2e-a');
    const slotBefore = await slotOf(page, 'e2e-a');

    // Move focus away from the card host.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.evaluate(() => document.body.focus());

    // Fire a grow command — since the host is not focused, onCardKeydown's
    // guard (event.target !== event.currentTarget) prevents the event from
    // being processed. Simulate by calling keyboard.press (which goes to the
    // last focused element / body — not the card host).
    await page.keyboard.press('Shift+ArrowRight');

    // Width and slot should be unchanged.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(widthBefore);
    await expect.poll(() => slotOf(page, 'e2e-a')).toMatchObject(slotBefore);
  });

  test('payload x/y matches DOM after keyboard moves', async ({ page }) => {
    await enterEditMode(page);

    // Move e2e-a via keyboard.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight');
    const domSlot = await slotOf(page, 'e2e-a');

    await resetSaved(page);
    await saveEdit(page);
    const payload = await readSaved(page);

    const card = savedCard(payload, 'e2e-a');
    expect(card.x).toBe(domSlot.x);
    expect(card.y).toBe(domSlot.y);
    expect(card.w).toBe(domSlot.w);
  });
});
