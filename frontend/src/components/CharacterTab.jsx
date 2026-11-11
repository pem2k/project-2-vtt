import React from 'react';
import CharacterCard from './CharacterCard.jsx';
import CharacterCreateForm from './CharacterCreateForm.jsx';

/**
 * CharacterTab component (#14, #55).
 * Composes CharacterCard, CharacterCreateForm, DM character selector,
 * loading indicators, and friendly error states within SettingsPanel.
 *
 * DMs see:
 * - Room character picker
 * - Selected character card (when available) with HP editor
 * - Persistent Create character section
 *
 * Players see:
 * - Their own character card with HP editor (if one exists)
 * - Or the creation form (if none exists)
 */
export default function CharacterTab({
  character = null,
  characters = [],
  isDM = false,
  onCreate,
  onSelect,
  onUpdateHp,
  characterLoading = false,
  characterError = null,
  characterReady = true,
  hidden = false,
}) {
  const handleSelectChange = (event) => {
    const next = characters.find((item) => item.id === event.target.value);
    if (next && onSelect) {
      onSelect(next);
    }
  };

  return (
    <div
      className="dm-tab-content dm-character-tab"
      hidden={hidden}
      style={{ display: hidden ? 'none' : undefined }}
    >
      {characterError && (
        <p className="auth-error" role="alert">
          {characterError}
        </p>
      )}

      {characterLoading ? (
        <p className="character-card-loading">Loading character...</p>
      ) : (
        characterReady && (
          <>
            {isDM ? (
              <div className="dm-character-container">
                {characters.length > 0 && (
                  <div className="character-card-field character-picker-field">
                    <label htmlFor="character-card-picker">View character</label>
                    <select
                      id="character-card-picker"
                      value={character?.id ?? ''}
                      onChange={handleSelectChange}
                    >
                      {!character?.id && <option value="">Select a character</option>}
                      {characters.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {character && <CharacterCard character={character} onUpdateHp={onUpdateHp} />}

                <section className="character-create-section">
                  <h3 className="character-section-title">Create character</h3>
                  <CharacterCreateForm onCreate={onCreate} />
                </section>
              </div>
            ) : character ? (
              <CharacterCard character={character} onUpdateHp={onUpdateHp} />
            ) : (
              <CharacterCreateForm onCreate={onCreate} />
            )}
          </>
        )
      )}
    </div>
  );
}
