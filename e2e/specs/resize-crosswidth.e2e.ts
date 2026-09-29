import { resizeCardByStep } from '../utils/drag';
import { getWidth } from '../utils/grid';
import { enterEditMode, openHarness } from '../utils/harness';
import { pressCommand } from '../utils/keyboard';
import { expect, test } from '@playwright/test';

// At 1280px viewport: 12 columns (breakpoint 'l'), spans = [3, 6, 12].
// At 1440px+ viewport: 16 columns (breakpoint 'xl'), spans = [4, 8, 12].
// The column count DOES change when crossing 1440px — the z-flow grid
// recomputes spans from the card's `size` property and the new column count.
const XL_WIDTH = 1500; // representative width > 1439

/**
 * Set the viewport width and poll until e2e-a's --gs-w reflects the expected
 * span for its size='s' card at the new column count.
 *
 * At 12 cols (< 1440): size='s' → span=3.
 * At 16 cols (≥ 1440): size='s' → span=4.
 *
 * The column change is driven by ResizeObserver + afterNextRender and is async;
 * polling for the span change is the reliable sentinel.
 */
async function setWidthAndSettle(
  page: import('@playwright/test').Page,
  width: number,
): Promise<void> {
  const height = 900;
  // e2e-a has size='s': span=3 at 12 cols, span=4 at 16 cols.
  const expectedW = width >= 1440 ? 4 : 3;

  await page.setViewportSize({ width, height });
  await expect
    .poll(() => getWidth(page, 'e2e-a'), { timeout: 5000 })
    .toBe(expectedW);
}

test.describe('Resize constraints at XL width (1440px)', () => {
  test.beforeEach(async ({ page }) => {
    // Load harness at 1280px (default), then widen to XL.
    // setWidthAndSettle polls until e2e-a's span settles to 4 (16-col span for 's').
    await openHarness(page);
    await setWidthAndSettle(page, XL_WIDTH);
  });

  test('at 1440px: gs-column is 16 (column count changes, not just card widths)', async ({
    page,
  }) => {
    const columns = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      if (!el) return 0;
      const raw = getComputedStyle(el).getPropertyValue('--gs-columns').trim();
      return raw ? parseInt(raw, 10) : 0;
    });
    expect(columns).toBe(16);
  });

  test('e2e-a (size=s): at 1440px span=4; resize ladder is [4,8,12]', async ({
    page,
  }) => {
    await enterEditMode(page);

    // At 16 cols, size='s' → span=4.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);

    // Grow: 4 → 8.
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(8);

    // Grow: 8 → 12.
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(12);

    // Attempt to grow beyond 12 — must be a no-op (top of ladder at 16 cols).
    const widthBefore = await getWidth(page, 'e2e-a');
    await resizeCardByStep(page, 'e2e-a', 'grow', 1);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(widthBefore);
    expect(widthBefore).toBe(12);
  });

  test('e2e-a resize ladder at 1440px via keyboard: [4,8,12]', async ({
    page,
  }) => {
    await enterEditMode(page);

    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);

    // 4 → 8.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 8 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(8);

    // 8 → 12.
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight', { w: 12 });
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(12);

    // 12 → no-op (top of ladder).
    await pressCommand(page, 'e2e-a', 'Shift+ArrowRight');
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(12);
  });

  test('e2e-b (size=m): at 1440px span=8', async ({ page }) => {
    // At 16 cols, size='m' → span=8.
    await expect.poll(() => getWidth(page, 'e2e-b')).toBe(8);
  });
});

// Cross-width transition tests: 1280 → 1440 → 1280 round-trip.
test.describe('Column count transition 1280 → 1440 → 1280', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page);
  });

  test('1280→1440: column count becomes 16 and spans adapt; 1440→1280: reverts to 12 and spans revert', async ({
    page,
  }) => {
    // At 1280px (default): 12 cols, e2e-a size='s' → span=3.
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(3);

    const col1280 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      if (!el) return 0;
      const raw = getComputedStyle(el).getPropertyValue('--gs-columns').trim();
      return raw ? parseInt(raw, 10) : 0;
    });
    expect(col1280).toBe(12);

    // Widen to XL: 16 cols, e2e-a → span=4.
    await setWidthAndSettle(page, XL_WIDTH);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(4);

    const colXL = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      if (!el) return 0;
      const raw = getComputedStyle(el).getPropertyValue('--gs-columns').trim();
      return raw ? parseInt(raw, 10) : 0;
    });
    expect(colXL).toBe(16);

    // Return to 1280px: 12 cols, e2e-a → span=3.
    await setWidthAndSettle(page, 1280);
    await expect.poll(() => getWidth(page, 'e2e-a')).toBe(3);

    const colAfterRevert = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="dashboard-grid"]');
      if (!el) return 0;
      const raw = getComputedStyle(el).getPropertyValue('--gs-columns').trim();
      return raw ? parseInt(raw, 10) : 0;
    });
    expect(colAfterRevert).toBe(12);
  });
});
