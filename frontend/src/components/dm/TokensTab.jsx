import React, { useEffect, useState } from 'react';
import { TOKEN_COLORS, validateTokenInput } from '../../lib/tokens.js';

/**
 * TokensTab component (#9, #10).
 * Manages token creation, color selection, assignment to members, and token removal.
 */
export default function TokensTab({
  tokens = [],
  members = [],
  onAddToken,
  onRemoveToken,
  onAssignToken,
  onRefreshMembers,
  isVisible = true,
  hidden = false,
}) {
  const [tokenName, setTokenName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TOKEN_COLORS[0].hex);
  const [tokenError, setTokenError] = useState(null);
  const [isAddingToken, setIsAddingToken] = useState(false);

  useEffect(() => {
    if (isVisible && onRefreshMembers) {
      onRefreshMembers();
    }
  }, [isVisible, onRefreshMembers]);

  const handleSubmitToken = async (e) => {
    e.preventDefault();
    const validationErr = validateTokenInput({ name: tokenName, color: selectedColor });
    if (validationErr) {
      setTokenError(validationErr);
      return;
    }
    setTokenError(null);
    if (!onAddToken) return;

    setIsAddingToken(true);
    try {
      await onAddToken(tokenName.trim(), selectedColor);
      setTokenName('');
    } catch (submitErr) {
      setTokenError(submitErr.message || 'Failed to add token.');
    } finally {
      setIsAddingToken(false);
    }
  };

  return (
    <div
      className="dm-tab-content dm-tokens-tab"
      hidden={hidden}
      style={{ display: hidden ? 'none' : undefined }}
    >
      <form onSubmit={handleSubmitToken} className="dm-token-form">
        <div className="dm-form-group">
          <label htmlFor="token-name-input" className="dm-label">
            Token Name
          </label>
          <input
            id="token-name-input"
            type="text"
            className="dm-input"
            placeholder="e.g. Goblin Scout"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            maxLength={40}
            disabled={isAddingToken}
          />
        </div>

        <div className="dm-form-group">
          <span className="dm-label">Token Color</span>
          <div className="dm-palette-swatches" role="radiogroup" aria-label="Token Color">
            {TOKEN_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                role="radio"
                aria-checked={selectedColor === c.hex}
                aria-label={c.name}
                className={`dm-color-swatch ${selectedColor === c.hex ? 'selected' : ''}`}
                style={{ backgroundColor: c.hex }}
                onClick={() => setSelectedColor(c.hex)}
              />
            ))}
          </div>
        </div>

        {tokenError && (
          <p role="alert" className="error-message">
            {tokenError}
          </p>
        )}

        <button type="submit" className="dm-submit-btn" disabled={isAddingToken}>
          {isAddingToken ? 'Adding...' : 'Add Token'}
        </button>
      </form>

      <div className="dm-tokens-list-section">
        <h3 className="visually-hidden">Tokens</h3>
        {tokens.length === 0 ? (
          <p className="dm-tokens-empty">No tokens on board.</p>
        ) : (
          <ul className="dm-tokens-list" role="list" aria-label="Tokens">
            {tokens.map((token) => {
              const isUnknown = Boolean(
                token.assigned_to && !members.some((m) => m.user_id === token.assigned_to),
              );

              return (
                <li key={token.id} className="dm-token-item">
                  <span className="dm-token-color-dot" style={{ backgroundColor: token.color }} />
                  <span className="dm-token-name">{token.name}</span>
                  <select
                    className="dm-token-assign-select"
                    aria-label={`Assign ${token.name}`}
                    value={token.assigned_to ?? ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      if (onAssignToken) {
                        onAssignToken(token, val);
                      }
                    }}
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name}
                        {m.role === 'dm' ? ' (DM)' : ''}
                      </option>
                    ))}
                    {isUnknown && <option value={token.assigned_to}>Unknown player</option>}
                  </select>
                  <button
                    type="button"
                    className="dm-token-remove-btn"
                    aria-label={`Remove ${token.name}`}
                    onClick={() => {
                      if (onRemoveToken) {
                        onRemoveToken(token);
                      }
                    }}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
