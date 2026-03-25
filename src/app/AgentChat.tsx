'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Message {
  from: 'user' | 'agent';
  text: string;
}

const SUGGESTED = [
  'What is this?',
  'How does booting work?',
  'What\'s the fairness agent?',
  'How do I post?',
];

export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        from: 'agent',
        text: 'Hey — I know everything about BSVibes. Ask me anything, or tap a question below.',
      }]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Clean up any in-flight stream on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const ask = useCallback(async function ask(question: string) {
    const userMsg: Message = { from: 'user', text: question };
    const thinking: Message = { from: 'agent', text: '...' };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, thinking]);
    setInput('');
    setIsStreaming(true);

    // Abort any previous stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.filter(m => m.text !== '...'),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessages([...newMessages, { from: 'agent', text: errorText || 'Agent had a hiccup — try again in a moment.' }]);
        setIsStreaming(false);
        return;
      }

      if (!res.body) {
        setMessages([...newMessages, { from: 'agent', text: "Couldn't reach the agent right now." }]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        // Update the last message with accumulated text
        const text = accumulated;
        setMessages([...newMessages, { from: 'agent', text }]);
      }

      // Final update (ensure last chunk is flushed)
      if (accumulated) {
        setMessages([...newMessages, { from: 'agent', text: accumulated }]);
      } else {
        setMessages([...newMessages, { from: 'agent', text: "I'm not sure how to answer that." }]);
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      console.error('Agent stream error:', e);
      setMessages([...newMessages, { from: 'agent', text: "Couldn't reach the agent right now." }]);
    } finally {
      setIsStreaming(false);
    }
  }, [messages]);

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    ask(input.trim());
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 border border-zinc-800 rounded-full px-2.5 py-1 hover:border-zinc-700 hover:text-zinc-300 hover:bg-zinc-900 transition-colors mt-1"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse flex-shrink-0" />
        Ask AI
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
        <div
          className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden pointer-events-auto animate-[slideUp_0.3s_ease-out] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-sm font-medium text-zinc-300">BSVibes Agent</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div
            className="h-[50vh] sm:h-[320px] overflow-y-auto scrollbar-hide px-4 py-3 space-y-3"
            style={{ scrollbarWidth: 'none' }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${msg.from === 'user' ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[10px] text-zinc-600 mb-0.5 px-1">
                  {msg.from === 'agent' ? 'agent' : 'you'}
                </span>
                <div
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed max-w-[85%] ${
                    msg.from === 'agent'
                      ? 'bg-zinc-900 text-zinc-300'
                      : 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                  } ${msg.text === '...' ? 'animate-pulse' : ''}`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested questions */}
          {messages.length <= 1 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {SUGGESTED.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  disabled={isStreaming}
                  className="text-xs text-zinc-500 border border-zinc-800 rounded-full px-3 py-1.5 hover:border-zinc-600 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-zinc-800 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); handleSubmit(e); } }}
              placeholder={isStreaming ? 'Thinking...' : 'Ask something...'}
              disabled={isStreaming}
              className="w-full bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
            />
          </div>
        </div>
      </div>
    </>
  );
}
