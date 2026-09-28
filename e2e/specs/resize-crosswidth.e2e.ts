import { expect, test } from '@playwright/test';
import { resizeCardByStep } from '../utils/drag';
import { getWidth } from '../utils/grid';
import { openHarness, enterEditMode } from '../utils/harness';
import { pressCommand } from '../utils/keyboard';

// XL_PAGE threshold: when the host element's contentRect.width >= 1440 the
// z-flow dashboard fires changeCardSettingsForXlPage and rewrites configured
// w:4→3 and maxW:4→3. Leaving XL (<1440) reverts them: w:3→4, maxW:3→4.
// The swap is driven by a ResizeObserver + afterNextRender, so it is ASYNC.
// Every cross-width test must POLL for the runtime value to settle, never read
// it immediately after a resize.
const XL_PAGE = 1440;

/**
 * Read the RUNTIME maxW off a card's gridstack node (the value the engine
 * enforces, after the XL swap potentially rewrites it).
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

/**
 * Set the viewport width and poll until the sentinel card's runtime maxW
 * reflects the expected post-swap value. The swap is async (ResizeObserver +
 * afterNextRender), so a raw setViewportSize + immediate read is racy.
 *
 * Uses e2e-a (configured maxW:4) as the sentinel because the XL swap writes
 * it to 3 on enter and back to 4 on leave — a clear observable signal.
 */
async function setWidthAndSettle(
  page: import('@playwright/test').Page,
  width: number,
): Promise<void> {
  const height = 900;
  const expectedMaxW = width >= XL_PAGE ? 3 : 4;

  await page.setViewportSize({ width, height });

  // Poll until the sentinel card's runtime maxW reflects the XL swap result.
  // e2e-a is configured maxW:4; the XL swap writes it to 3 at ≥1440 and back
  // to 4 at <1440. This ensures the swap has fully settled before assertions.
  await expect
    .poll(() => getRuntimeMaxW(page, 'e2e-a'), { timeout: 5000 })
    .toBe(expectedMaxW);
}

// These tests verify resize behavior at XL width (>= 1440px). The approach
// mirrors the transition tests: load the harness at the default 1280px viewport,
// then programmatically widen to 1500px via setWidthAndSettle, which polls until
// the ResizeObserver + afterNextRender swap has settled. This is the same
// pattern proven by the transition tests and avoids the ambiguity of test.use
// viewport vs device-emulation device context from the project config.
test.describe('Resize constraints at XL width (1440px)', () => {
  test.beforeEach(async ({ page }) => {
    // Load harness at 1280px (default viewport), then enter XL by widening.
    // setWidthAndSettle polls until e2e-a's runtime maxW reflects the XL-enter
    // swap (configured maxW:4 → runtime maxW:3).
    await openHarness(page);
    await setWidthAndSettle(page, 1500);
  });

  test('e2e-a (configured maxW:4): at 1440px runtime maxW is 3, resize ladder stops at 3 not 4', async ({
    page,
  }) => {
    await enterEditMode(page);

    // At 1440px the XL swap rewrites maxW:4 → runtime maxW:3 for e2e-a.
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-a')).toBe(3);

    // Start width should be 1.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(1);

    // Grow: 1 → 2.
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(2);

    // Grow: 2 → 3 (maxW is now 3, so the next step is 3, NOT 4 as at 1280px).
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(3);

    // Attempt to grow beyond 3 — must be a no-op (capped at runtime maxW=3).
    const widthBefore = await getWidth(page, 'e2e-a');
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(widthBefore);
    expect(widthBefore).toBe(3); // confirm the cap
  });

  test('e2e-a resize ladder at 1440px is [1,2,3] — contrast 1280px [1,2,4]', async ({
    page,
  }) => {
    await enterEditMode(page);

    // At 1440px: allowed resize widths for e2e-a are [1, 2, 3] (XL maxW=3).
    // Keyboard steps confirm the exact ladder without pixel math.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(1);

    // 1 → 2.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 2 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(2);

    // 2 → 3 (at 1280px, the next step would jump to 4 — here it stops at 3).
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 3 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(3);

    // 3 → no-op (at XL maxW=3 cap).
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight');
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(3);
  });

  test('e2e-d (configured maxW:2): stays at 2 at 1440px — XL swap never touches maxW:2', async ({
    page,
  }) => {
    await enterEditMode(page);

    // e2e-d is configured maxW:2. The XL swap only rewrites maxW:4↔3; it leaves
    // maxW:2 untouched. Verify runtime maxW is still 2 at 1440px.
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-d')).toBe(2);

    // Grow to max.
    await resizeCardByStep(page, 'e2e-d', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-d')).toBe(2);

    // Attempt beyond maxW=2 — must be a no-op.
    await resizeCardByStep(page, 'e2e-d', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-d')).toBe(2);
  });

  test('gs-column stays 4 at 1440px — only w/maxW change, not column count', async ({
    page,
  }) => {
    // gs-column must remain 4 even after the XL swap has fired.
    const columns = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      return el ? parseInt(el.getAttribute('gs-column') ?? '4', 10) : 4;
    });
    expect(columns).toBe(4);
  });
});

// Cross-width transition tests: 1280 → 1440 → 1280 round-trip.
// These verify enter-XL swap then revert, running at the DEFAULT 1280px
// viewport and then resizing programmatically.
test.describe('XL width swap transition 1280 → 1440 → 1280', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('1280→1440 enters XL swap (maxW:4→3) then 1440→1280 reverts (maxW:3→4)', async ({
    page,
  }) => {
    // At 1280px (default), e2e-a runtime maxW=4 (configured maxW:4, XL swap left).
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-a')).toBe(4);

    // Enter XL: 1280 → 1440.
    await setWidthAndSettle(page, 1440);

    // The XL enter swap rewrites maxW:4 → 3.
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-a')).toBe(3);

    // gs-column must still be 4 (XL swap does NOT change the column count).
    const columnsAtXL = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      return el ? parseInt(el.getAttribute('gs-column') ?? '4', 10) : 4;
    });
    expect(columnsAtXL).toBe(4);

    // Leave XL: 1440 → 1280.
    await setWidthAndSettle(page, 1280);

    // The XL leave swap reverts maxW:3 → 4.
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-a')).toBe(4);

    // gs-column must still be 4 after the revert.
    const columnsAfterRevert = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      return el ? parseInt(el.getAttribute('gs-column') ?? '4', 10) : 4;
    });
    expect(columnsAfterRevert).toBe(4);
  });

  test('e2e-b (configured maxW:3): enters XL at 1440 → runtime maxW 3 stays 3; leaves XL → reverts to 4', async ({
    page,
  }) => {
    // At 1280px: the "leaving XL" branch at grid init wrote e2e-b maxW:3 → 4
    // (see BASELINE in resize-constraints.e2e.ts). So we start at runtime maxW=4.
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-b')).toBe(4);

    // Enter XL: the "entering XL" branch fires, writing runtime maxW:4 → 3.
    await setWidthAndSettle(page, 1440);
    // NOTE: setWidthAndSettle uses e2e-a as sentinel, but e2e-b's swap must
    // also complete at the same time (same ResizeObserver batch).
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-b')).toBe(3);

    // Leave XL: reverts to 4.
    await setWidthAndSettle(page, 1280);
    await expect.poll(() => getRuntimeMaxW(page, 'e2e-b')).toBe(4);
  });
});
