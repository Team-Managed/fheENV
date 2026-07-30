import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Mermaid } from "@/components/docs/Mermaid";
import type { ComponentProps, ReactElement } from "react";
import type { TOCItemType } from "fumadocs-core/toc";

function Pre(props: ComponentProps<"pre">) {
  const child = props.children as ReactElement<{ className?: string; children?: string }>;
  if (
    child?.props?.className === "language-mermaid" &&
    typeof child?.props?.children === "string"
  ) {
    return <Mermaid chart={child.props.children.trim()} />;
  }
  const DefaultPre = defaultMdxComponents.pre!;
  return <DefaultPre {...props} />;
}

const mdxComponents = {
  ...defaultMdxComponents,
  pre: Pre,
  Mermaid,
};

export default async function Page(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  interface FumadocsPageData {
    title: string;
    description?: string;
    body: React.ComponentType<{ components: Record<string, unknown> }>;
    toc: TOCItemType[];
  }
  const { body: MDX, toc } = page.data as unknown as FumadocsPageData;

  return (
    <DocsPage toc={toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={mdxComponents} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: `${page.data.title} - fheENV Docs`,
    description: page.data.description,
  };
}
