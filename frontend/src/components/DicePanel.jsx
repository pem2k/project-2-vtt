import React from 'react';
import { DICE_TYPES } from '../lib/dice.js';

export default function DicePanel({ onRoll, disabled = false }) {
  return (
    <section className="dice-panel" aria-label="Dice">
      <div className="dice-panel-buttons">
        {DICE_TYPES.map((die) => (
          <button
            key={die}
            type="button"
            className="dice-button"
            aria-label={`Roll ${die}`}
            disabled={disabled}
            onClick={() => onRoll(die)}
          >
            {die}
          </button>
        ))}
      </div>
    </section>
  );
}
