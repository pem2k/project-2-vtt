import React from 'react';
import { DICE_TYPES } from '../lib/dice.js';

export default function DicePanel({ rolls = [], onRoll, disabled = false }) {
  const hasRolls = rolls.length > 0;

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
      {hasRolls ? (
        <ul className="dice-roll-list">
          {rolls.map((roll, index) => (
            <li key={`${roll.playerName}-${roll.die}-${roll.result}-${index}`}>
              {`${roll.playerName} rolled ${roll.die}: ${roll.result}`}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dice-empty">No rolls yet.</p>
      )}
    </section>
  );
}
