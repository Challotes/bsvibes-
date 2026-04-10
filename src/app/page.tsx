import { getBootboard, getPosts } from "./actions";
import { Feed } from "./Feed";

export const revalidate = 10;

export default async function Home() {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()]);

  return (
    <div className="h-screen bg-black text-white overflow-hidden">
      <Feed posts={posts} bootboard={bootboard} />
    </div>
  );
}
