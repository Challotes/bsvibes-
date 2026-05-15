import { getBootboard, getPosts } from "./actions";
import { Feed } from "./Feed";

export const revalidate = 10;

export default async function Home() {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()]);

  return (
    // Gradient: amber for the top env(safe-area-inset-top) zone, black
    // below. The amber band paints behind the iOS status bar (translucent
    // overlay in PWA; behind the time/battery in Safari when URL bar is
    // at bottom). Below the band the page is fully black, which combines
    // with themeColor: "#000000" so Safari's bottom URL bar is also black.
    // Result: top amber + bottom black on both Safari and PWA.
    <div
      className="h-[100dvh] text-white overflow-hidden touch-pan-x touch-pan-y overscroll-none"
      style={{
        background:
          "linear-gradient(to bottom, #f59e0b 0, #f59e0b env(safe-area-inset-top), #000 env(safe-area-inset-top), #000 100%)",
      }}
    >
      <Feed posts={posts} bootboard={bootboard} />
    </div>
  );
}
