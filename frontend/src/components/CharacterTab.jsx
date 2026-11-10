import React from 'react';
import CharacterCard from './CharacterCard.jsx';

/**
 * CharacterTab component (#55).
 * Composes CharacterCard, loading indicator, and friendly error states within SettingsPanel.
 */
export default function CharacterTab({
  character = null,
  characters = [],
  isDM = false,
  onCreate,
  onSelect,
  characterLoading = false,
  characterError = null,
  characterReady = true,
  hidden = false,
}) {
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
          <CharacterCard
            character={character}
            characters={characters}
            isDM={isDM}
            onCreate={onCreate}
            onSelect={onSelect}
          />
        )
      )}
    </div>
  );
}
