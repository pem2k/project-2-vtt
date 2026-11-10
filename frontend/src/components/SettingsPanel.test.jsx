import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import SettingsPanel from './SettingsPanel.jsx';
import * as floatingPanelLayout from '../hooks/useFloatingPanelLayout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DM_PANEL_ORIGIN = { x: 32, y: 80 };

function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function settingsPanel(container) {
  return container.querySelector('aside[aria-label="Settings"]');
}

function characterTab(panel) {
  return [...panel.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'Character');
}

describe('SettingsPanel', () => {
  let container;
  let root;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('is hidden when closed, visible when open, and shows a Character tab', async () => {
    const renderPanel = (isOpen) =>
      act(async () => {
        root.render(
          <SettingsPanel isOpen={isOpen} onClose={vi.fn()}>
            <p>Character body</p>
          </SettingsPanel>,
        );
      });

    await renderPanel(false);

    const panel = settingsPanel(container);
    expect(panel, 'settings panel').not.toBeNull();
    expect(panel.hidden).toBe(true);
    expect(panel.style.display).toBe('none');
    expect(characterTab(panel), 'Character tab').not.toBeNull();

    await renderPanel(true);

    expect(panel.hidden).toBe(false);
    expect(panel.style.display).toBe('');
    const tab = characterTab(panel);
    expect(tab, 'Character tab').not.toBeNull();
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(panel.textContent).toContain('Character body');
  });

  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <SettingsPanel isOpen={true} onClose={onClose}>
          <p>Character body</p>
        </SettingsPanel>,
      );
    });

    const closeButton = settingsPanel(container).querySelector(
      'button[aria-label="Close settings"]',
    );
    expect(closeButton, 'settings close button').toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      closeButton.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps children mounted while the panel is closed', async () => {
    function KeptChild() {
      const [value, setValue] = useState('');
      return (
        <input
          aria-label="Kept child"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }

    const renderPanel = (isOpen) =>
      act(async () => {
        root.render(
          <SettingsPanel isOpen={isOpen} onClose={vi.fn()}>
            <KeptChild />
          </SettingsPanel>,
        );
      });

    await renderPanel(false);

    const panel = settingsPanel(container);
    expect(panel, 'settings panel').not.toBeNull();
    expect(panel.hidden).toBe(true);
    expect(panel.querySelector('[aria-label="Kept child"]'), 'child while closed').not.toBeNull();

    await renderPanel(true);

    const input = panel.querySelector('[aria-label="Kept child"]');
    await act(async () => {
      setInputValue(input, 'still here');
    });

    await renderPanel(false);

    expect(panel.hidden).toBe(true);
    expect(panel.style.display).toBe('none');
    expect(panel.querySelector('[aria-label="Kept child"]').value).toBe('still here');

    await renderPanel(true);

    expect(panel.querySelector('[aria-label="Kept child"]').value).toBe('still here');
  });

  it('uses its own layout storage key and a default position offset from DM Controls', async () => {
    const spy = vi.spyOn(floatingPanelLayout, 'useFloatingPanelLayout');

    await act(async () => {
      root.render(
        <SettingsPanel isOpen={true} onClose={vi.fn()}>
          <p>Character body</p>
        </SettingsPanel>,
      );
    });

    expect(spy).toHaveBeenCalled();
    const options = spy.mock.calls[0][0] ?? {};
    expect(options.storageKey).toBe('open_vtt_settings_layout');
    expect(typeof options.defaultLayout?.x).toBe('number');
    expect(typeof options.defaultLayout?.y).toBe('number');
    expect(
      options.defaultLayout.x === DM_PANEL_ORIGIN.x &&
        options.defaultLayout.y === DM_PANEL_ORIGIN.y,
    ).toBe(false);

    const panel = settingsPanel(container);
    expect(panel.style.left).toBe(`${options.defaultLayout.x}px`);
    expect(panel.style.top).toBe(`${options.defaultLayout.y}px`);
    expect(panel.style.left === '32px' && panel.style.top === '80px').toBe(false);
  });
});
