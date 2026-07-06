import { source } from "@/lib/source";
import {
    DocsPage,
    DocsBody,
    DocsTitle,
    DocsDescription,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Mermaid } from "@/components/docs/Mermaid";
import type { ComponentProps, ReactElement } from "react";

function Pre(props: ComponentProps<"pre">) {
    const child = props.children as ReactElement<{ className?: string; children?: string }>;
    if (
        child?.props?.className === "language-mermaid" &&
        typeof child?.props?.children === "string"
    ) {
        return <Mermaid chart={child.props.children.trim()} />;
    }
    const DefaultPre = defaultMdxComponents.pre!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <DefaultPre {...(props as any)} />;
}

const mdxComponents = {
    ...defaultMdxComponents,
    pre: Pre,
    Mermaid,
};

export default async function Page(props: {
    params: Promise<{ slug?: string[] }>;
}) {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { body: MDX, toc } = page.data as any;

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

export async function generateMetadata(props: {
    params: Promise<{ slug?: string[] }>;
}) {
    const params = await props.params;
    const page = source.getPage(params.slug);
    if (!page) notFound();

    return {
        title: `${page.data.title} - fheENV Docs`,
        description: page.data.description,
    };
}
