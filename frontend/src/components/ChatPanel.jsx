import React, { useState, useRef, useEffect } from 'react';

/**
 * ChatPanel component.
 * Positioned on the right side of the screen.
 * Displays message history with "username: text" format and a text input field at the bottom.
 * Includes a top tab bar, including a "DM Controls" toggle tab when the current user is a DM.
 */
export default function ChatPanel({ currentUser, isDM, isDMModalOpen, onToggleDMControls }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const username =
    currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Player';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const newMsg = {
      id: crypto.randomUUID(),
      username,
      text: trimmed,
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
        {messages.length === 0 ? (
          <p className="chat-empty">No messages yet.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="chat-message-row">
              <span className="chat-username">{msg.username}: </span>
              <span className="chat-text">{msg.text}</span>
            </div>
          ))
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
