import { getPosts, getBootboard } from './actions';
import { Feed } from './Feed';
import { IdentityChip } from './IdentityBar';

export default async function Home() {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()]);

  return (
    <div className="h-screen bg-black text-white overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-zinc-800 bg-black/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight"><span className="text-amber-400">BS</span>Vibes</h1>
          <IdentityChip />
        </div>
      </header>

      {/* Feed + Bootboard + Compose */}
      <Feed posts={posts} bootboard={bootboard} />
    </div>
  );
}
