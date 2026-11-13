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

test('DM hosts, player joins, dice, maps and grid sync, and room survives refresh', async ({
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

    // Uploading and selecting maps reaches the player without refreshing.
    await dm.getByRole('button', { name: 'Open Settings', exact: true }).click();
    await dm.getByRole('tab', { name: 'Maps', exact: true }).click();
    const images = await dm.evaluate(() =>
      Object.fromEntries(
        ['red', 'blue'].map((color) => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 8;
          const context = canvas.getContext('2d');
          context.fillStyle = color;
          context.fillRect(0, 0, 8, 8);
          return [color, canvas.toDataURL('image/png').split(',')[1]];
        }),
      ),
    );
    const mapFile = {
      name: 'grid-check.png',
      mimeType: 'image/png',
      buffer: Buffer.from(images.red, 'base64'),
    };
    const mapPixel = () =>
      player
        .locator('.konvajs-content canvas')
        .first()
        .evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(10, 10, 1, 1).data));
    await dm.locator('#map-file-input').setInputFiles(mapFile);
    await expect(dm.locator('.dm-map-active-badge')).toBeVisible();
    await expect.poll(mapPixel).toEqual([255, 0, 0, 255]);
    await dm.locator('#map-file-input').setInputFiles({
      ...mapFile,
      name: 'grid-second.png',
      buffer: Buffer.from(images.blue, 'base64'),
    });
    await expect.poll(mapPixel).toEqual([0, 0, 255, 255]);
    await dm
      .getByRole('list', { name: 'Uploaded maps' })
      .getByText('grid-check', { exact: true })
      .click();
    await expect.poll(mapPixel).toEqual([255, 0, 0, 255]);
    const dmLayers = dm.locator('.konvajs-content canvas');
    const playerLayers = player.locator('.konvajs-content canvas');
    await expect(playerLayers).toHaveCount(3);
    await dm.getByRole('button', { name: /Hide Grid/ }).click();
    await expect(dmLayers).toHaveCount(2);
    await expect(playerLayers).toHaveCount(2);

    await player.reload();
    await expect(playerLayers).toHaveCount(2);
    await expect(player.getByRole('heading', { name: roomName, exact: true })).toBeVisible();
    await expect(player.getByRole('button', { name: 'Roll d20', exact: true })).toBeEnabled();
    await player.getByRole('button', { name: 'Roll d20', exact: true }).click();
    await expect(dm.locator('.chat-roll-row')).toHaveCount(2);
    await expect(player.locator('.chat-roll-row')).toHaveCount(1);
    await expect(dm.locator('.chat-roll-row').last()).toHaveText(
      await player.locator('.chat-roll-row').innerText(),
    );
    await dm.getByRole('button', { name: /Show Grid/ }).click();
    await expect(dmLayers).toHaveCount(3);
    await expect(playerLayers).toHaveCount(3);
    const slider = dm.getByRole('slider', { name: 'Grid cell size in pixels' });
    await expect(slider).toBeEnabled();
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('55');
    await expect(dm.getByRole('button', { name: /Hide Grid/ })).toBeEnabled();
    const track = await slider.boundingBox();
    await dm.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(track.x + track.width * 0.7, track.y + track.height / 2, { steps: 5 });
    await dm.mouse.up();
    const draggedSize = await slider.inputValue();
    expect(Number(draggedSize)).toBeGreaterThan(55);
    await expect(dm.getByRole('button', { name: /Hide Grid/ })).toBeEnabled();
    await dm.reload();
    await dm.getByRole('button', { name: 'Open Settings', exact: true }).click();
    await dm.getByRole('tab', { name: 'Maps', exact: true }).click();
    await expect(slider).toHaveValue(draggedSize);
  } finally {
    await Promise.allSettled([dmContext.close(), playerContext.close()]);
  }
});
