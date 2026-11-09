import React, { useState } from 'react';
import { validateCharacterInput } from '../lib/characters.js';

/**
 * Parse a form field into an integer.
 * Rejects blanks, decimals, and other non-integer text so validation can explain why.
 * @param {string} value
 * @returns {number}
 */
function parseIntegerInput(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    return Number.NaN;
  }
  return Number.parseInt(value.trim(), 10);
}

/**
 * Character card (#13). Display and create only.
 * Props stay narrow so issue #14 can add HP, notes, and AC editing later.
 *
 * @param {object|null} character - The card to show. Null renders the create form.
 * @param {Array} characters - Room characters. DMs with more than one get a picker.
 * @param {boolean} isDM
 * @param {(input: { name: string, maxHp: number, ac: number }) => void|Promise<void>} onCreate
 * @param {(character: object) => void} onSelect - Called with the chosen character row.
 */
export default function CharacterCard({
  character = null,
  characters = [],
  isDM = false,
  onCreate,
  onSelect,
}) {
  const [name, setName] = useState('');
  const [maxHp, setMaxHp] = useState('');
  const [ac, setAc] = useState('');
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const showPicker = isDM && characters.length > 1;
  const notesText = typeof character?.notes === 'string' ? character.notes : '';
  const hasNotes = notesText.trim().length > 0;

  function handleSelectChange(event) {
    const next = characters.find((item) => item.id === event.target.value);
    if (next && onSelect) {
      onSelect(next);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const parsedMaxHp = parseIntegerInput(maxHp);
    const parsedAc = parseIntegerInput(ac);
    const validationError = validateCharacterInput({
      name,
      maxHp: parsedMaxHp,
      ac: parsedAc,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await onCreate?.({
        name,
        maxHp: parsedMaxHp,
        ac: parsedAc,
      });
    } catch {
      // The page shows a friendly message. Keep database text and ids off this card.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="character-card">
      {showPicker && (
        <div className="character-card-field">
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

      {character ? (
        <div className="character-card-body">
          <h2 className="character-card-name">{character.name}</h2>
          <p className="character-card-stat">
            HP {character.hp} / {character.max_hp}
          </p>
          <p className="character-card-stat">AC {character.ac}</p>
          <p className={hasNotes ? 'character-card-notes' : 'character-card-notes is-empty'}>
            {hasNotes ? notesText : 'No notes'}
          </p>
        </div>
      ) : (
        <form className="character-card-form" onSubmit={handleSubmit}>
          <div className="character-card-field">
            <label htmlFor="character-name">Name</label>
            <input
              id="character-name"
              name="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="character-card-field">
            <label htmlFor="character-max-hp">Max HP</label>
            <input
              id="character-max-hp"
              name="maxHp"
              type="text"
              inputMode="numeric"
              value={maxHp}
              onChange={(event) => setMaxHp(event.target.value)}
            />
          </div>
          <div className="character-card-field">
            <label htmlFor="character-ac">AC</label>
            <input
              id="character-ac"
              name="ac"
              type="text"
              inputMode="numeric"
              value={ac}
              onChange={(event) => setAc(event.target.value)}
            />
          </div>
          {formError && (
            <p className="auth-error" role="alert">
              {formError}
            </p>
          )}
          <button className="btn" type="submit" disabled={submitting}>
            Create character
          </button>
        </form>
      )}
    </article>
  );
}
