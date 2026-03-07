import { DocsBody, DocsDescription, DocsTitle } from "fumadocs-ui/page";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type BlogPageData, blog } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

type Props = { params: Promise<{ slug: string }> };

export default async function BlogPost(props: Props) {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) notFound();

  const data = post.data as BlogPageData;
  const MDX = data.body;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <Link
        href="/blog"
        className="mb-6 inline-flex text-sm text-fd-muted-foreground hover:text-fd-foreground"
      >
        &larr; Back to blog
      </Link>
      <DocsTitle>{data.title}</DocsTitle>
      <p className="mt-2 text-sm text-fd-muted-foreground">
        {new Date(data.date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
        {" · "}
        {data.author}
      </p>
      <DocsDescription>{data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents()} />
      </DocsBody>
    </main>
  );
}

export function generateStaticParams() {
  return blog.getPages().map((page) => ({
    slug: page.slugs[0],
  }));
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const post = blog.getPage([params.slug]);
  if (!post) notFound();

  return {
    title: post.data.title,
    description: post.data.description,
  };
}
