import { test, expect, type Page } from '@playwright/test';

/**
 * Manual scheduling mode's click-driven wizard (replaced the drag-and-drop board).
 *
 * The scheduling tab persists `schedulingMode` on the season as soon as the
 * Auto/Manual toggle is clicked, so every test restores Auto afterwards to leave
 * the fixture season as it found it. Drafts are never saved (no Save Draft click),
 * so the slots these tests create are discarded on reload.
 */

const SEASON_SCHEDULING = '/seasons/1/scheduling';

/** The wizard dialog. */
const wizard = (page: Page) => page.locator('[data-slot="dialog-content"]');

async function gotoManualMode(page: Page) {
  await page.goto(SEASON_SCHEDULING);
  await page.getByRole('button', { name: 'Manual slots' }).click();
  await expect(page.getByRole('button', { name: /Add Game/i })).toBeVisible({ timeout: 10000 });
}

/** Walk steps 1-4, leaving the wizard parked on the venue step. */
async function fillThroughTime(page: Page, away: string, home: string) {
  const d = wizard(page);
  await d.getByRole('button', { name: away, exact: true }).click();
  await d.getByRole('button', { name: home, exact: true }).click();
  // Any day in the month the calendar opens on.
  await d.locator('button[aria-label^="Sat "]').first().click();
  await d.getByRole('button', { name: '10:00 AM', exact: true }).click();
}

test.describe('Desktop: Season manual scheduling wizard', () => {
  test.beforeEach(async ({ page }) => {
    await gotoManualMode(page);
  });

  test.afterEach(async ({ page }) => {
    // Restore the season's persisted scheduling mode.
    const auto = page.getByRole('button', { name: 'Auto (rules)' });
    if (await auto.isVisible().catch(() => false)) await auto.click();
  });

  test('Add Game opens a five-step wizard on the away step', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();

    const d = wizard(page);
    await expect(d).toBeVisible();
    await expect(d.getByText('Add game', { exact: true })).toBeVisible();
    await expect(d.getByRole('heading', { name: /which team is away/i })).toBeVisible();

    // Stepper: five steps, all unset.
    const steps = d.getByRole('navigation', { name: 'Game steps' }).getByRole('button');
    await expect(steps).toHaveCount(5);
    await expect(d.getByText('Step 1 of 5', { exact: true })).toBeVisible();
  });

  test('picking an away team advances to home and excludes that team', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();
    const d = wizard(page);

    await d.getByRole('button', { name: 'Padres', exact: true }).click();

    await expect(d.getByRole('heading', { name: /which team is home/i })).toBeVisible();
    // The away team cannot also be the home team.
    await expect(d.getByRole('button', { name: 'Padres', exact: true })).toHaveCount(0);
    await expect(d.getByRole('button', { name: 'Dodgers', exact: true })).toBeVisible();
  });

  test('the venue step keeps the wizard open and offers both commit actions', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();
    const d = wizard(page);
    await fillThroughTime(page, 'Padres', 'Dodgers');

    await expect(d.getByRole('heading', { name: /which venue and field/i })).toBeVisible();
    // Nothing is committable until a venue lands.
    await expect(d.getByRole('button', { name: 'Add game', exact: true })).toBeDisabled();

    await d.locator('section').first().getByRole('button').first().click();

    // The venue click must NOT auto-close the wizard.
    await expect(d).toBeVisible();
    await expect(d.getByRole('button', { name: 'Add game', exact: true })).toBeEnabled();
    await expect(d.getByRole('button', { name: 'Add game & start another' })).toBeEnabled();
  });

  test('Add game commits one slot and closes', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();
    const d = wizard(page);
    await fillThroughTime(page, 'Padres', 'Dodgers');
    await d.locator('section').first().getByRole('button').first().click();
    await d.getByRole('button', { name: 'Add game', exact: true }).click();

    await expect(d).toBeHidden();
    await expect(page.getByText('1/1 slots filled')).toBeVisible();
    await expect(page.getByText(/Working on \(1\)/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
  });

  test('Add game & start another reopens a completely blank wizard', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();
    const d = wizard(page);
    await fillThroughTime(page, 'Padres', 'Dodgers');
    await d.locator('section').first().getByRole('button').first().click();
    await d.getByRole('button', { name: 'Add game & start another' }).click();

    // Still open, back on step 1, and nothing carried forward.
    await expect(d).toBeVisible();
    await expect(d.getByRole('heading', { name: /which team is away/i })).toBeVisible();
    const steps = d.getByRole('navigation', { name: 'Game steps' }).getByRole('button');
    for (const label of ['Away', 'Home', 'Date', 'Time', 'Venue']) {
      await expect(steps.filter({ hasText: label }).first()).toHaveAttribute(
        'aria-label', `${label}: not set`
      );
    }
  });

  test('Escape mid-wizard creates nothing', async ({ page }) => {
    await page.getByRole('button', { name: /Add Game/i }).click();
    const d = wizard(page);
    await d.getByRole('button', { name: 'Padres', exact: true }).click();
    await d.getByRole('button', { name: 'Dodgers', exact: true }).click();

    await page.keyboard.press('Escape');

    await expect(d).toBeHidden();
    await expect(page.getByText('No slots yet')).toBeVisible();
  });

  test('clicking a card field opens a single-step editor that commits and closes', async ({ page }) => {
    await page.getByRole('button', { name: /Add Blank Slot/i }).click();
    await page.getByRole('button', { name: 'Set date' }).click();

    const d = wizard(page);
    await expect(d.getByText('Change date', { exact: true })).toBeVisible();
    // Single-field edit shows no stepper and no advance.
    await expect(d.getByRole('navigation', { name: 'Game steps' })).toHaveCount(0);

    await d.locator('button[aria-label^="Sat "]').first().click();

    await expect(d).toBeHidden();
    await expect(page.getByRole('button', { name: 'Set date' })).toHaveCount(0);
  });

  test('a blank slot flags its missing venue', async ({ page }) => {
    await page.getByRole('button', { name: /Add Blank Slot/i }).click();
    await expect(page.getByRole('button', { name: 'Set venue (required)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set home team' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set away team' })).toBeVisible();
  });

  test('the drag palette is gone from manual mode', async ({ page }) => {
    // The old board had a "Drag palette — venue · date · time" tray and a sticky
    // team palette; the wizard replaced both.
    await expect(page.getByText(/Drag palette/i)).toHaveCount(0);
  });
});

test.describe('Desktop: Auto mode drag-and-drop still works', () => {
  // Guards the TeamChip / SlotPosition components the manual board no longer uses
  // but auto mode still depends on.
  test('a team chip drags into a slot position', async ({ page }) => {
    await page.goto(SEASON_SCHEDULING);
    await page.getByRole('button', { name: 'Auto (rules)' }).click();

    const generate = page.getByRole('button', { name: /Generate Slots/i });
    await expect(generate).toBeVisible({ timeout: 10000 });

    // Auto mode only produces slots once a day rule with a venue exists. Configure
    // one through the real controls — Save Rules is never clicked, so nothing is
    // persisted, and generated slots stay client-side until Commit.
    await page.locator('input[type=date]').nth(0).fill('2026-09-05');
    await page.locator('input[type=date]').nth(1).fill('2026-10-10');
    await page.locator('#sched-day-6').check(); // dow 6 = Saturday

    // The venue select only exists once the Saturday rule renders its slot row.
    const venueSelect = page.locator('select').filter({ hasText: 'Venue (required)' }).first();
    await expect(venueSelect).toBeVisible();
    const venueValue = await venueSelect.locator('option[value]:not([value=""])').first().getAttribute('value');
    if (!venueValue) throw new Error('season has no venues to schedule into');
    await venueSelect.selectOption(venueValue);

    await generate.click();

    const chip = page.locator('[aria-describedby*="DndDescribedBy"]').filter({ hasText: 'Angels' }).first();
    await expect(chip).toBeVisible({ timeout: 10000 });
    await chip.scrollIntoViewIfNeeded();
    const drop = page.locator('div.border-dashed').filter({ hasText: /^Home$/ }).first();

    const from = await chip.boundingBox();
    const to = await drop.boundingBox();
    if (!from || !to) throw new Error('drag endpoints not measurable');

    // dnd-kit's PointerSensor needs >6px of travel and several move events —
    // page.dragAndDrop() fires too few to trip the activation constraint.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator('div.cursor-grab').filter({ hasText: 'Angels' }).first()).toBeVisible();
  });
});
