import React, { useEffect, useRef, useState } from 'react';
import { toFriendlyCharacterError, validateHpInput } from '../lib/characters.js';

/**
 * CharacterCard component (#13, #14).
 * Displays character details (name, AC, notes) and provides the current-HP editor.
 *
 * @param {object} props
 * @param {object|null} props.character - The character to display.
 * @param {(characterId: string, hp: number) => Promise<object>} [props.onUpdateHp]
 */
export default function CharacterCard({ character = null, onUpdateHp }) {
  const [prevCharId, setPrevCharId] = useState(character?.id);
  const [prevHp, setPrevHp] = useState(character?.hp);
  const [hpDraft, setHpDraft] = useState(() =>
    character?.hp !== undefined ? String(character.hp) : '',
  );
  const [isDirty, setIsDirty] = useState(false);
  const [hpError, setHpError] = useState(null);
  const [saving, setSaving] = useState(false);

  const latestCharIdRef = useRef(character?.id);
  useEffect(() => {
    latestCharIdRef.current = character?.id;
  }, [character?.id]);

  if (character && character.id !== prevCharId) {
    // Selected character changed: reset to new character's state
    setPrevCharId(character.id);
    setPrevHp(character.hp);
    setHpDraft(character.hp !== undefined ? String(character.hp) : '');
    setIsDirty(false);
    setHpError(null);
    setSaving(false);
  } else if (character && character.hp !== prevHp) {
    // Background update for the same character:
    // Only overwrite if the user has NOT actively edited a dirty draft
    setPrevHp(character.hp);
    if (!isDirty) {
      setHpDraft(character.hp !== undefined ? String(character.hp) : '');
    }
  }

  if (!character) {
    return null;
  }

  const notesText = typeof character.notes === 'string' ? character.notes : '';
  const hasNotes = notesText.trim().length > 0;

  async function handleSaveHp(event) {
    event.preventDefault();
    if (saving) return;

    const validationError = validateHpInput(hpDraft, character.max_hp);
    if (validationError) {
      setHpError(validationError);
      return;
    }

    const parsedHp = Number.parseInt(String(hpDraft).trim(), 10);
    setHpError(null);
    setSaving(true);
    const targetCharId = character.id;

    try {
      const updated = await onUpdateHp?.(character.id, parsedHp);
      if (latestCharIdRef.current === targetCharId) {
        setIsDirty(false);
        if (updated && updated.hp !== undefined) {
          setHpDraft(String(updated.hp));
        }
      }
    } catch (err) {
      if (latestCharIdRef.current === targetCharId) {
        setHpError(toFriendlyCharacterError(err, 'Failed to update HP.'));
      }
    } finally {
      if (latestCharIdRef.current === targetCharId) {
        setSaving(false);
      }
    }
  }

  return (
    <article className="character-card">
      <div className="character-card-body">
        <h2 className="character-card-name">{character.name}</h2>

        <p className="character-card-stat">
          HP {character.hp} / {character.max_hp}
        </p>

        <form className="character-hp-form" onSubmit={handleSaveHp}>
          <div className="character-hp-editor">
            <label htmlFor={`character-hp-${character.id}`} className="character-hp-label">
              Current HP
            </label>
            <div className="character-hp-input-group">
              <input
                id={`character-hp-${character.id}`}
                name="currentHp"
                type="text"
                inputMode="numeric"
                className="character-hp-input"
                value={hpDraft}
                disabled={saving}
                onChange={(e) => {
                  setHpDraft(e.target.value);
                  setIsDirty(true);
                  setHpError(null);
                }}
              />
              <span className="character-hp-max">/ {character.max_hp}</span>
              <button type="submit" className="btn btn-save-hp" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          {hpError && (
            <p className="auth-error character-hp-error" role="alert">
              {hpError}
            </p>
          )}
        </form>

        <p className="character-card-stat">AC {character.ac}</p>
        <p className={hasNotes ? 'character-card-notes' : 'character-card-notes is-empty'}>
          {hasNotes ? notesText : 'No notes'}
        </p>
      </div>
    </article>
  );
}
