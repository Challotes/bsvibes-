'use client';

import { useRef, useTransition } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import { createPost } from './actions';

export function PostForm(): React.JSX.Element {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isPending, startTransition] = useTransition();
  const { identity, sign } = useIdentity();

  function handleSubmit(formData: FormData): void {
    if (!identity) return;

    formData.set('author', identity.name);

    startTransition(async () => {
      // Sign the post content
      const content = formData.get('content');
      if (typeof content === 'string' && content.trim()) {
        const sig = await sign(content.trim());
        if (sig) {
          formData.set('signature', sig.signature);
          formData.set('pubkey', sig.pubkey);
        }
      }

      await createPost(formData);
      formRef.current?.reset();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="w-full max-w-2xl">
      <div className="relative">
        <textarea
          ref={textareaRef}
          name="content"
          aria-label="Share an idea"
          placeholder="Share an idea..."
          autoFocus
          maxLength={1000}
          disabled={isPending || !identity}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 pr-14 text-base resize-none focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600 min-h-[56px] max-h-[200px] disabled:opacity-50"
          rows={1}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
        <button
          type="submit"
          disabled={isPending || !identity}
          className="absolute right-3 bottom-3 bg-white text-black rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isPending ? '...' : 'Post'}
        </button>
      </div>
    </form>
  );
}
