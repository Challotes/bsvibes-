import { getPosts } from './actions';
import { PostForm } from './PostForm';
import { IdentityBar } from './IdentityBar';

export default async function Home() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Build From Nothing
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Post an idea. Every contribution is logged on-chain.
          </p>
        </div>

        {/* Post Form */}
        <PostForm />

        {/* Identity Bar */}
        <IdentityBar />

        {/* Posts Feed */}
        <div className="mt-10 space-y-4">
          {posts.length === 0 && (
            <p className="text-center text-sm text-zinc-600">
              No posts yet. Be the first to share an idea.
            </p>
          )}
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="font-medium text-zinc-400">
                  {post.author_name}
                </span>
                <span>·</span>
                <time>
                  {new Date(post.created_at + 'Z').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                {post.signature && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-600" title="Cryptographically signed">
                      ✓ signed
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                {post.content}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
