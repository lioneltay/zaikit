import Link from "next/link";
import { type BlogPageData, blog } from "@/lib/source";

export default function BlogIndex() {
  const posts = blog.getPages().sort((a, b) => {
    const aData = a.data as BlogPageData;
    const bData = b.data as BlogPageData;
    return new Date(bData.date).getTime() - new Date(aData.date).getTime();
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Blog</h1>
      <p className="mb-10 text-fd-muted-foreground">
        Updates and announcements from the ZAIKit team.
      </p>
      <div className="flex flex-col gap-8">
        {posts.map((post) => {
          const data = post.data as BlogPageData;
          return (
            <Link
              key={post.url}
              href={post.url}
              className="group rounded-lg border border-fd-border p-6 transition-colors hover:bg-fd-accent/50"
            >
              <p className="mb-1 text-sm text-fd-muted-foreground">
                {new Date(data.date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                {" · "}
                {data.author}
              </p>
              <h2 className="text-xl font-semibold group-hover:text-fd-primary">
                {data.title}
              </h2>
              {data.description && (
                <p className="mt-2 text-sm text-fd-muted-foreground">
                  {data.description}
                </p>
              )}
            </Link>
          );
        })}
        {posts.length === 0 && (
          <p className="text-fd-muted-foreground">No posts yet.</p>
        )}
      </div>
    </main>
  );
}
