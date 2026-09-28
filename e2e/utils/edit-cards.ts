import { expect, type Page } from '@playwright/test';

/**
 * Open the "Edit Cards" dialog from within edit mode. The toolbar edit-cards
 * button (testid dashboard-edit-cards-btn) opens the dialog
 * (dashboard-edit-cards-dialog).
 */
export async function openEditCardsDialog(page: Page): Promise<void> {
  await page.locator('[data-testid="dashboard-edit-cards-btn"]').click();
  await expect(
    page.locator('[data-testid="dashboard-edit-cards-dialog"]'),
  ).toBeVisible();
}

/**
 * Toggle a card's availability switch in the Edit Cards dialog. Each row has a
 * ui5-switch with testid dashboard-edit-cards-switch-<id>; clicking it fires
 * the ui5Change handler that flips selection.
 */
export async function toggleCard(page: Page, id: string): Promise<void> {
  const sw = page.locator(
    `ui5-switch[data-testid="dashboard-edit-cards-switch-${id}"]`,
  );
  await expect(sw).toBeVisible();
  await sw.click();
}

/**
 * Confirm the Edit Cards dialog (Save button, testid
 * dashboard-edit-cards-save-btn) and wait for it to close.
 */
export async function saveEditCards(page: Page): Promise<void> {
  await page.locator('[data-testid="dashboard-edit-cards-save-btn"]').click();
  await expect(
    page.locator('[data-testid="dashboard-edit-cards-dialog"]'),
  ).not.toBeVisible();
}
