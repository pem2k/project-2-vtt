import React, { useState } from 'react';
import { toFriendlyCharacterError, validateCharacterInput } from '../lib/characters.js';

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
 * Character creation form extracted from CharacterCard (#14).
 * Handles draft inputs, validation, submitting states, and friendly error alerts.
 *
 * @param {object} props
 * @param {(input: { name: string, maxHp: number, ac: number }) => Promise<unknown>} props.onCreate
 */
export default function CharacterCreateForm({ onCreate }) {
  const [name, setName] = useState('');
  const [maxHp, setMaxHp] = useState('');
  const [ac, setAc] = useState('');
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
        name: name.trim(),
        maxHp: parsedMaxHp,
        ac: parsedAc,
      });
      setName('');
      setMaxHp('');
      setAc('');
    } catch (err) {
      setFormError(toFriendlyCharacterError(err, 'Unable to create character.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
  );
}
