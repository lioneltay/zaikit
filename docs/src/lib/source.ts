import { blogPosts, docs } from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import type { MDXContent } from "mdx/types";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

export const blog = loader({
  baseUrl: "/blog",
  source: toFumadocsSource(blogPosts, []),
});

export type BlogPageData = {
  title: string;
  description?: string;
  author: string;
  date: string;
  body: MDXContent;
};
