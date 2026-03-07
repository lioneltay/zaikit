import { remarkImage, remarkMdxMermaid } from "fumadocs-core/mdx-plugins";
import {
  defineCollections,
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
});

export const blogPosts = defineCollections({
  type: "doc",
  dir: "content/blog",
  schema: frontmatterSchema.extend({
    author: z.string(),
    date: z.string().date(),
  }),
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid, remarkImage],
  },
});
