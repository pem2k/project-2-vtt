import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DMControls from './DMControls.jsx';

describe('DMControls tokens tab', () => {
  it('renders the tokens form and token list with accessible controls', () => {
    const tokens = [
      { id: 'token-1', name: 'Goblin Scout', color: '#E6194B' },
      { id: 'token-2', name: 'Aria', color: '#4363D8' },
    ];

    const markup = renderToStaticMarkup(
      <DMControls
        isOpen={true}
        initialTab="tokens"
        tokens={tokens}
        onAddToken={vi.fn()}
        onRemoveToken={vi.fn()}
      />,
    );

    // Form and inputs
    expect(markup).toContain('Token Name');
    expect(markup).toContain('id="token-name-input"');
    expect(markup).toContain('Add Token');

    // Palette swatches with accessible color names
    expect(markup).toContain('aria-label="Red"');
    expect(markup).toContain('aria-label="Blue"');
    expect(markup).toContain('aria-label="Green"');

    // Token list items and remove buttons
    expect(markup).toContain('Goblin Scout');
    expect(markup).toContain('aria-label="Remove Goblin Scout"');
    expect(markup).toContain('Aria');
    expect(markup).toContain('aria-label="Remove Aria"');
  });
});
