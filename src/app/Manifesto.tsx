'use client';

interface ManifestoProps {
  onAskAgent?: () => void;
}

export function Manifesto({ onAskAgent }: ManifestoProps) {
  return (
    <div className="border-l-2 border-amber-500/60 bg-amber-950/10 px-4 py-5 mb-0">
      {/* Eyebrow */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4 bg-amber-500 rounded-full" />
        <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-[0.12em]">
          The Vision
        </span>
      </div>

      {/* Hook heading */}
      <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight tracking-tight mb-3">
        A platform that builds itself.
      </h2>

      {/* Body */}
      <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
        <p>
          Not a startup. Not a pitch deck. A different model entirely — one where the people who
          build something are the people who own it.
        </p>
        <p>
          Here's how the old world works: your labor flows up. Value pools at the top. You get
          what they decide.
        </p>
        <p>
          Here's how this works: value flows directly to the people who created it. No
          intermediary. No approval process. Automatic, on-chain, provable.
        </p>
        <p>
          Post an idea. It's timestamped. Immutable. Yours.
        </p>
        <p>
          If someone builds on it — your rough sketch, your half-formed thought, your fragment of
          something real — you get credited. Forever. Because the chain doesn't lie and it doesn't
          forget.
        </p>
        <p>
          Experts of every field, building what they care about most. Not what a board approves.
          What drives them.
        </p>
        <p>
          Your contribution doesn't have to be finished. It just has to be real.
        </p>
        <p>
          And when this model is proven? It replicates. Any idea becomes its own project. Its own
          ecosystem. You become the founder. Others carry it forward. And what you built — even the
          small thing, the early thing, the thing nobody noticed yet — compounds.
        </p>
        <p className="text-zinc-200 font-medium">
          This is what happens when the builders keep what they build.
        </p>
        <p>
          Be part of it.{' '}
          {onAskAgent ? (
            <button
              onClick={onAskAgent}
              className="text-amber-400 hover:text-amber-300 transition-colors underline underline-offset-2"
            >
              Chat with the agent to learn more.
            </button>
          ) : (
            <span className="text-amber-400">Chat with the agent to learn more.</span>
          )}
        </p>
      </div>
    </div>
  );
}
