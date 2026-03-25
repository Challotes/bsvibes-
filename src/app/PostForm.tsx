'use client';

import { useRef, useState, useTransition, useEffect } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { createPost } from './actions';
import { AgentChat } from './AgentChat';

interface PostFormProps {
  onPostCreated?: (content: string, author: string) => void;
}

export function PostForm({ onPostCreated }: PostFormProps): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const [isListening, setIsListening] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { identity, sign } = useIdentityContext();

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // Refocus textarea after post completes
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (wasPendingRef.current && !isPending) {
      textareaRef.current?.focus();
    }
    wasPendingRef.current = isPending;
  }, [isPending]);

  function submitForm(): void {
    if (!identity || !formRef.current) return;
    const formData = new FormData(formRef.current);
    const content = formData.get('content');
    if (typeof content !== 'string' || !content.trim()) return;

    formData.set('author', identity.name);

    // Show optimistic post and clear form IMMEDIATELY — don't wait for signing or server
    const trimmed = content.trim();
    onPostCreated?.(trimmed, identity.name);
    formRef.current?.reset();
    setHasContent(false);
    setJustPosted(true);
    setTimeout(() => setJustPosted(false), 1500);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }

    startTransition(async () => {
      const sig = await sign(trimmed);
      if (sig) {
        formData.set('signature', sig.signature);
        formData.set('pubkey', sig.pubkey);
      }
      await createPost(formData);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitForm();
    }
  }

  function toggleMic(): void {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join('');

      if (textareaRef.current) {
        textareaRef.current.value = transcript;
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
    setIsListening(true);
  }

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submitForm(); }} className="w-full max-w-2xl">
      <div className="relative">
        <textarea
          ref={textareaRef}
          name="content"
          aria-label="Share an idea"
          placeholder={!identity ? 'Setting up your identity...' : 'Share an idea...'}
          autoFocus
          maxLength={1000}
          disabled={!identity}
          onKeyDown={handleKeyDown}
          className={`w-full bg-zinc-900 border rounded-2xl px-3 py-3 pr-14 sm:px-4 sm:py-4 text-sm sm:text-base resize-none focus:outline-none placeholder:text-zinc-600 min-h-[48px] sm:min-h-[56px] max-h-[200px] disabled:opacity-50 scrollbar-hide transition-colors duration-300 ${
            justPosted
              ? 'border-green-600/60 focus:border-green-600/60'
              : !identity
              ? 'border-zinc-800 animate-pulse'
              : 'border-zinc-800 focus:border-zinc-700'
          }`}
          style={{ scrollbarWidth: 'none' }}
          rows={1}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
            setHasContent(el.value.trim().length > 0);
          }}
        />
        {hasContent ? (
          <button
            type="button"
            onClick={submitForm}
            disabled={!identity}
            className="absolute right-2.5 bottom-2.5 sm:right-3 sm:bottom-3 bg-amber-500 text-black rounded-full p-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-amber-400"
            title="Post"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14m0 0l-6-6m6 6l-6 6" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleMic}
            disabled={!identity}
            className={`absolute right-2.5 bottom-2.5 sm:right-3 sm:bottom-3 rounded-full p-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              isListening
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
            title={isListening ? 'Stop recording' : 'Voice to text'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 ml-1 mr-1">
        <div className="hidden sm:flex items-center gap-2">
          <p className="text-[11px] text-zinc-600">Enter to post, Shift+Enter for new line</p>
          <span
            className={`text-[11px] text-green-500 transition-opacity duration-300 ${justPosted ? 'opacity-100' : 'opacity-0'}`}
            aria-live="polite"
          >
            Posted
          </span>
        </div>
        <p className="text-[11px] text-zinc-600 sm:hidden">&nbsp;</p>
        <AgentChat />
      </div>
    </form>
  );
}
