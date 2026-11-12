import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

async function signUp(page, email) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByPlaceholder('Password', { exact: true }).fill('Local-E2E-only-123!');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Host', exact: true })).toBeVisible();
}

test('DM hosts, player joins, dice broadcast to both, and room survives refresh', async ({
  browser,
}) => {
  const id = randomUUID();
  const roomName = `E2E ${id}`;
  const dmContext = await browser.newContext();
  const playerContext = await browser.newContext();
  try {
    const dm = await dmContext.newPage();
    const player = await playerContext.newPage();
    await signUp(dm, `e2e-dm-${id}@test.dev`);
    await signUp(player, `e2e-player-${id}@test.dev`);

    await dm.getByRole('button', { name: 'Host', exact: true }).click();
    await dm.getByRole('textbox', { name: 'Room name' }).fill(roomName);
    await dm.getByLabel('Password', { exact: true }).fill('E2E-room-only');
    await dm.getByRole('button', { name: 'Create Room', exact: true }).click();
    await expect(dm.getByRole('heading', { name: roomName, exact: true })).toBeVisible();

    await player.getByRole('button', { name: 'Join', exact: true }).click();
    await player.getByRole('textbox', { name: 'Room name' }).fill(roomName);
    await player.getByLabel('Password', { exact: true }).fill('E2E-room-only');
    await player.getByRole('button', { name: 'Join Room', exact: true }).click();
    await expect(player).toHaveURL(dm.url());
    await expect(player.getByRole('heading', { name: roomName, exact: true })).toBeVisible();

    await expect(dm.getByRole('button', { name: 'Roll d20', exact: true })).toBeEnabled();
    await expect(player.getByRole('button', { name: 'Roll d20', exact: true })).toBeEnabled();
    // A player roll received by the DM proves the player joined the socket room.
    await player.getByRole('button', { name: 'Roll d20', exact: true }).click();
    await expect(dm.locator('.chat-roll-row')).toHaveCount(1);
    await expect(player.locator('.chat-roll-row')).toHaveCount(1);
    await expect(dm.locator('.chat-roll-row')).toHaveText(
      await player.locator('.chat-roll-row').innerText(),
    );

    await player.reload();
    await expect(player.getByRole('heading', { name: roomName, exact: true })).toBeVisible();
    await expect(player.getByRole('button', { name: 'Roll d20', exact: true })).toBeEnabled();
    await player.getByRole('button', { name: 'Roll d20', exact: true }).click();
    await expect(dm.locator('.chat-roll-row')).toHaveCount(2);
    await expect(player.locator('.chat-roll-row')).toHaveCount(1);
    await expect(dm.locator('.chat-roll-row').last()).toHaveText(
      await player.locator('.chat-roll-row').innerText(),
    );
  } finally {
    await dmContext.close();
    await playerContext.close();
  }
});
