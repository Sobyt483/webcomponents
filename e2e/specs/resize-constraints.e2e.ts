import { expect, test } from '@playwright/test';
import { resizeCardByStep } from '../utils/drag';
import { getHeight, getWidth, slotOf } from '../utils/grid';
import { openHarness, enterEditMode } from '../utils/harness';
import { readSaved, resetSaved, saveEdit, savedCard } from '../utils/saved';

/**
 * Helper: read the RUNTIME maxW off a card's gridstack node. This is the value
 * the engine actually enforces during resize — distinct from the maxW passed in
 * via the harness dataset, because changeCardSettingsForXlPage rewrites it at
 * grid init. Reads it from the DOM element's `gridstackNode` back-reference that
 * gridstack attaches to every `.grid-stack-item`.
 */
async function getRuntimeMaxW(
  page: import('@playwright/test').Page,
  id: string,
): Promise<number | undefined> {
  return page.evaluate((cardId) => {
    const el = document.querySelector(
      `.grid-stack-item[gs-id="${cardId}"]`,
    ) as (HTMLElement & { gridstackNode?: { maxW?: number } }) | null;
    if (!el) throw new Error(`Card ${cardId} not found`);
    return el.gridstackNode?.maxW;
  }, id);
}

test.describe('Resize constraints', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('e2e-a: full ladder 1 → 2 → 4 via drag resize', async ({ page }) => {
    await enterEditMode(page);

    // Start width should be 1.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(1);

    // Grow step 1: 1 → 2.
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(2);

    // Grow step 2: 2 → 4 (next allowed width for maxW=4 is 4, skipping 3).
    await resizeCardByStep(page, 'e2e-a', 'grow', 2);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);
  });

  test('e2e-b: pinned by effectiveMax (columns - x), not its own maxW — growing is a no-op', async ({
    page,
  }) => {
    await enterEditMode(page);

    // Start width is 2.
    await expect.poll(() => getWidth(page, 'e2e-b')).toBe(2);

    // NOTE — this asserts the effectiveMax clamp, NOT e2e-b's configured maxW.
    // e2e-b is CONFIGURED with maxW=3, but the dashboard's XL width-swap
    // (changeCardSettingsForXlPage) rewrites its runtime maxW to 4 at grid init
    // (see the dedicated baseline test below). z-flow then packs e2e-b at x=1
    // (e2e-a sits at x=0/y=0), so its effective max = columns - x = 4 - 1 = 3.
    // The allowed stepped widths are getAllowedResizeWidths(maxW=4, cols=4,
    // minW=1, effectiveMax=3) = [1,2,4] clamped/filtered ≤ 3 => [1,2]. e2e-b
    // already starts at 2, the TOP of that ladder, so every grow step is a
    // genuine no-op. Real per-card maxW clamping is covered by e2e-d (maxW=2,
    // a value the XL swap never rewrites).
    const widthBefore = await getWidth(page, 'e2e-b');
    expect(widthBefore).toBe(2);

    // Attempt to grow — width must stay pinned at the cap.
    await resizeCardByStep(page, 'e2e-b', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-b')).toBe(widthBefore);

    // A second grow attempt is likewise a no-op and never breaches the grid.
    await resizeCardByStep(page, 'e2e-b', 'grow', 1);
    const capped = await getWidth(page, 'e2e-b');
    expect(capped).toBe(widthBefore);
    expect(capped).toBeLessThanOrEqual(4);
  });

  // BASELINE SNAPSHOT for the Gridstack v14 migration (#318/#319). This locks in
  // the current XL-width-swap behavior so the migration can be validated against
  // it. changeCardSettingsForXlPage (dashboard.component.ts) remaps card widths
  // between the 4-column base layout and the XL 3-column layout. XL_PAGE=1440;
  // at our 1280px viewport the "leaving XL" branch fires at grid init and
  // rewrites any configured maxW:3 -> maxW:4 (and w:3 -> w:4). maxW:4 is left as
  // 4, and maxW:2 is NEVER touched by the swap. If the v14 migration changes any
  // of these runtime values, THIS test breaks first and on purpose — decide then
  // whether the change is intended.
  test('BASELINE: XL width-swap rewrites configured maxW:3 -> runtime maxW:4 at 1280px', async ({
    page,
  }) => {
    // e2e-b is configured maxW:3 in the harness — the swap rewrites it to 4.
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-b')).toBe(4);

    // e2e-a / e2e-c are configured maxW:4 — the swap leaves them at 4.
    expect(await getRuntimeMaxW(page, 'e2e-a')).toBe(4);
    expect(await getRuntimeMaxW(page, 'e2e-c')).toBe(4);

    // e2e-d is configured maxW:2 — a value the swap never touches, so it is the
    // one card whose own maxW clamp is genuinely exercised (see the e2e-d test).
    expect(await getRuntimeMaxW(page, 'e2e-d')).toBe(2);
  });

  test('e2e-c: shrink from minW=2 is blocked', async ({ page }) => {
    await enterEditMode(page);

    // Start width is 2 (= minW).
    await expect.poll(() => getWidth(page, 'e2e-c')).toBe(2);

    // Attempt shrink — should stay at 2.
    const widthBefore = await getWidth(page, 'e2e-c');
    await resizeCardByStep(page, 'e2e-c', 'shrink', 1);
    await expect.poll(() => getWidth(page, 'e2e-c')).toBe(widthBefore);
  });

  test('e2e-d: grows 1 → 2, then capped at maxW=2', async ({ page }) => {
    await enterEditMode(page);

    // Start width is 1.
    await expect.poll(() => getWidth(page, 'e2e-d')).toBe(1);

    // Grow: 1 → 2.
    await resizeCardByStep(page, 'e2e-d', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-d')).toBe(2);

    // Attempt to grow beyond maxW=2 — should stay at 2.
    const widthBefore = await getWidth(page, 'e2e-d');
    await resizeCardByStep(page, 'e2e-d', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-d')).toBe(widthBefore);
  });

  test('loose card height stays pinned at 40 across resize (z-flow height constraint)', async ({
    page,
  }) => {
    await enterEditMode(page);

    // Record height before resize.
    const hBefore = await getHeight(page, 'e2e-a');

    // Grow e2e-a by one step.
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);

    // Height must remain unchanged — z-flow pins h = maxH = minH = cardHeight.
    const hAfter = await getHeight(page, 'e2e-a');
    expect(hAfter).toBe(hBefore);
    // Confirm it is still the cardHeight value (40).
    expect(hAfter).toBe(40);
  });

  test('saved payload w matches final --gs-w after resize', async ({ page }) => {
    await enterEditMode(page);

    // Grow e2e-a to width 4.
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(2);
    await resizeCardByStep(page, 'e2e-a', 'grow', 2);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);

    const domSlot = await slotOf(page, 'e2e-a');

    await resetSaved(page);
    await saveEdit(page);
    const payload = await readSaved(page);

    const card = savedCard(payload, 'e2e-a');
    expect(card.w).toBe(domSlot.w);
    expect(card.w).toBe(4);
  });
});
