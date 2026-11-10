import React, { useState, useRef, useEffect } from 'react';
import { formatRollMessage, parseRollCommand } from '../lib/dice.js';

/**
 * ChatPanel component.
 * Positioned on the right side of the screen.
 * Displays message history with "username: text" format and a text input field at the bottom.
 * Public dice rolls share that list, in time order, and read as roll lines rather than chat.
 * Includes a top tab bar, including a "DM Controls" toggle tab when the current user is a DM.
 */
export default function ChatPanel({
  currentUser,
  isDM,
  isDMModalOpen,
  onToggleDMControls,
  rolls = [],
  onRoll,
}) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const username =
    currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Player';

  const timeline = [
    ...messages.map((message) => ({ kind: 'message', at: message.at, message })),
    ...rolls.map((roll) => ({ kind: 'roll', at: roll.at, roll })),
  ].sort((left, right) => left.at - right.at);

  const isLogEmpty = messages.length === 0 && rolls.length === 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, rolls]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const command = parseRollCommand(trimmed);
    if (command.isCommand) {
      if (command.notation && typeof onRoll === 'function') {
        onRoll(command.notation);
      }
      setInputText('');
      return;
    }

    const newMsg = {
      id: crypto.randomUUID(),
      username,
      text: trimmed,
      at: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  return (
    <aside className="chat-panel" aria-label="Game Chat Panel">
      {/* Top Header / Tabs of the Chat Panel */}
      <div className="chat-top-tabs">
        <span className="chat-tab-title">Chat</span>
        {isDM && (
          <button
            type="button"
            className={`chat-dm-tab-button ${isDMModalOpen ? 'active' : ''}`}
            onClick={onToggleDMControls}
            aria-label={isDMModalOpen ? 'Close DM Controls' : 'Open DM Controls'}
            title="DM Controls"
          >
            ⚙️
          </button>
        )}
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {isLogEmpty ? (
          <p className="chat-empty">No messages yet.</p>
        ) : (
          timeline.map((entry) =>
            entry.kind === 'roll' ? (
              <div key={entry.roll.id} className="chat-roll-row">
                {formatRollMessage(entry.roll)}
              </div>
            ) : (
              <div key={entry.message.id} className="chat-message-row">
                <span className="chat-username">{entry.message.username}: </span>
                <span className="chat-text">{entry.message.text}</span>
              </div>
            ),
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chat-input-form">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="chat-input-field"
          aria-label="Chat message input"
        />
      </form>
    </aside>
  );
}
