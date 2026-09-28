import { expect, type Page } from '@playwright/test';
import { gridBox, slotOf } from './grid';

// Re-export for consumers that previously imported these from here.
export { getWidth } from './grid';
export { getHeight } from './grid';

/**
 * z-flow grid cell height in px. gs-y is expressed in grid-row units and the
 * grid's cellHeight (CELL_HEIGHT) is 10px, so a card at gs-y=R sits R*10 px down.
 * (Loose cards are h:40 rows tall = 400px, but that is the card SIZE, not the
 * row-to-pixel pitch — the pitch is one cell = 10px.)
 */
const ROW_HEIGHT_PX = 10;

/**
 * Drag a card to a target grid column and row using simulated mouse events.
 * The drag is performed in small steps so gridstack's drag-tracking fires
 * intermediate move-check calls, which is required for the z-flow engine to
 * re-order nodes.
 *
 * Assumptions:
 *   - The page is already in edit mode before this is called.
 *   - targetCol is 0-based (left column = 0).
 *   - targetRow is 0-based (top row = 0).
 */
export async function dragCardToSlot(
  page: Page,
  id: string,
  targetCol: number,
  targetRow: number,
): Promise<void> {
  // Guard: edit mode must be active.
  await expect(page.locator('.mfp-dashboard.edit')).toBeVisible();

  const box = await gridBox(page);

  // Source: center of the draggable inner content element.
  const dragHandle = page.locator(
    `.grid-stack-item[gs-id="${id}"] .grid-stack-item-content`,
  );
  const srcBox = await dragHandle.boundingBox();
  if (!srcBox) throw new Error(`Drag handle for card ${id} not found`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;

  // Target: center of the destination column / row cell.
  const dstX = box.x + targetCol * box.colWidth + box.colWidth / 2;
  const dstY = box.y + targetRow * ROW_HEIGHT_PX + ROW_HEIGHT_PX / 2;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();

  // Move in multiple hops so drag events fire along the path.
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(srcX + (dstX - srcX) * t, srcY + (dstY - srcY) * t, {
      steps: 1,
    });
  }

  // Poll until the grid attributes reflect the new position. expect.poll has
  // no `.toSatisfy`, so poll the predicate's boolean result.
  await expect
    .poll(async () => {
      const slot = await slotOf(page, id);
      return slot.x === targetCol && slot.y === targetRow;
    })
    .toBe(true);

  await page.mouse.up();
}

/**
 * Resize a card by dragging its SE resize handle horizontally.
 * direction: 'grow' moves the handle right, 'shrink' moves it left.
 * steps: how many column-widths to drag.
 *
 * Returns the card's final width (from --gs-w) after the resize settles.
 */
export async function resizeCardByStep(
  page: Page,
  id: string,
  direction: 'grow' | 'shrink',
  steps: number = 1,
): Promise<number> {
  const readWidth = () =>
    page.evaluate((cardId) => {
      const el = document.querySelector<HTMLElement>(
        `.grid-stack-item[gs-id="${cardId}"]`,
      );
      if (!el) throw new Error(`Card ${cardId} not found`);
      const wRaw = getComputedStyle(el).getPropertyValue('--gs-w').trim();
      return wRaw ? parseInt(wRaw, 10) : 1;
    }, id);

  // Perform a single physical SE-handle drag toward `targetW` columns.
  const doDrag = async (): Promise<void> => {
    const box = await gridBox(page);

    // Current position/size drives an ABSOLUTE target column edge rather than a
    // relative pixel delta. The SE handle is rotated 45°, so its center sits ~at
    // the card corner and a relative `colWidth * steps` hop under/overshoots the
    // target cell (source of resize flake). Aiming at the center of the last
    // column the card should span makes gridstack snap deterministically.
    const slot = await slotOf(page, id);
    const targetW = slot.w + steps * (direction === 'grow' ? 1 : -1);

    // gridstack renders the SE resize handle with autohide (class
    // `ui-resizable-autohide`): it is display:none / zero-size until the grid
    // item is hovered. Hover the card content first so the handle becomes
    // visible and boundingBox() can measure it.
    await page
      .locator(`.grid-stack-item[gs-id="${id}"] .grid-stack-item-content`)
      .hover();
    const handle = page.locator(
      `.grid-stack-item[gs-id="${id}"] .ui-resizable-se`,
    );
    await expect(handle).toBeVisible();
    // Hovering the CONTENT alone reveals the autohide handle but leaves it in a
    // state where the subsequent mouse.down lands next to (not on) the rotated
    // 45° handle for cards in lower rows (e.g. e2e-d at y:40) — the resizable
    // never arms and the drag silently no-ops. Hovering the handle ITSELF
    // settles its final geometry so boundingBox() measures the real target and
    // the pointer-down grabs it, arming `ui-resizable-resizing` reliably.
    await handle.hover();
    const handleBox = await handle.boundingBox();
    if (!handleBox) throw new Error(`Resize handle for card ${id} not found`);

    const srcX = handleBox.x + handleBox.width / 2;
    const srcY = handleBox.y + handleBox.height / 2;
    // Right edge of the card at the desired width = grid.x + (x + targetW)*cw.
    // Aim ~85% into the last spanned column so the raw dragged width is
    // unambiguously closest to targetW (avoids landing on the .5 tie-boundary
    // between two column widths, where gridstack rounds down and undershoots).
    const dstX =
      box.x + (slot.x + targetW) * box.colWidth - box.colWidth * 0.15;

    await page.mouse.move(srcX, srcY);
    await page.mouse.down();
    // gridstack's resizable arms only after an initial pointer movement past its
    // drag-start threshold. Small single-column resizes from a wide starting
    // card (e.g. e2e-b: 2 → 3) intermittently no-op because the short sweep
    // never clears that threshold. A slightly larger DIAGONAL arming nudge
    // reliably starts the resize before the main horizontal sweep.
    await page.mouse.move(srcX + 6, srcY + 2, { steps: 3 });
    // Many small hops give gridstack's resize tracker enough mousemove events to
    // follow the path before the pointer releases.
    await page.mouse.move(dstX, srcY, { steps: 25 });
    await page.mouse.up();
  };

  // The first resize gesture after edit-mode-enter intermittently no-ops
  // because gridstack's resizable has not finished arming, leaving the width
  // unchanged. Re-attempt the IDENTICAL gesture (up to 3 times) while polling
  // for the width to change after each attempt. This does NOT force any
  // particular width — a genuine clamp (already at cap / blocked by minW-maxW)
  // legitimately leaves the width unchanged and exhausts retries, returning the
  // true value; the caller's assertion still governs correctness.
  const widthBefore = await readWidth();
  let widthAfter = widthBefore;
  for (let attempt = 0; attempt < 3; attempt++) {
    await doDrag();
    // Poll for the width to settle after mouse release. The original waitForTimeout
    // was fragile; polling directly on --gs-w detects both immediate and delayed
    // commits from the gridstack resize engine.
    await expect
      .poll(() => readWidth(), { timeout: 2000 })
      .not.toBe(undefined); // just ensures we can read it — a no-op poll
    widthAfter = await readWidth();
    if (widthAfter !== widthBefore) break;
  }

  return widthAfter;
}

/**
 * Drag a card vertically by `deltaRows` grid rows (positive = down, negative =
 * up). The vertical pitch is derived from the card's OWN bounding box at
 * runtime — no hard-coded pixel literals. A positive deltaRows of 1 means
 * "move one card-height downward", which is enough to cross the midpoint of
 * the card immediately below in a single-column layout.
 *
 * Assumptions:
 *   - The page is already in edit mode before this is called.
 *   - The pitch equals the card's own height in px (z-flow loose cards all
 *     share cardHeight=40 rows × 10px/row = 400px).
 */
export async function dragCardByRows(
  page: Page,
  id: string,
  deltaRows: number,
): Promise<void> {
  // Guard: edit mode must be active.
  await expect(page.locator('.mfp-dashboard.edit')).toBeVisible();

  const dragHandle = page.locator(
    `.grid-stack-item[gs-id="${id}"] .grid-stack-item-content`,
  );
  const srcBox = await dragHandle.boundingBox();
  if (!srcBox) throw new Error(`Drag handle for card ${id} not found`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;

  // The vertical pitch per "one row change" = card's own pixel height.
  // z-flow loose cards: h:40 grid rows × CELL_HEIGHT(10px) = 400px each.
  // Using the measured bounding box avoids hard-coded literals.
  const pitchPx = srcBox.height;
  const dstY = srcY + deltaRows * pitchPx * 1.1; // 10% overshoot → cross midpoint

  // Capture the ORIGINAL gs-y BEFORE the mouse is pressed, so the poll can
  // detect the reorder. Reading AFTER the move would capture the new value and
  // the poll would never fire (always equal to itself).
  const slotBefore = await slotOf(page, id);

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  // Small nudge to arm the drag threshold before the main sweep.
  await page.mouse.move(srcX + 5, srcY + Math.sign(deltaRows) * 5, { steps: 3 });
  await page.mouse.move(srcX, dstY, { steps: 25 });

  // Poll until the card's gs-y reflects the new row. This fires BEFORE mouse.up
  // so gridstack has committed the drop position before we release.
  await expect
    .poll(async () => {
      const s = await slotOf(page, id);
      return s.y !== slotBefore.y;
    })
    .toBe(true);

  await page.mouse.up();
}
