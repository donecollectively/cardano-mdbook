import head from "next/head.js";
const Head = head.default;
import { slugifyWithCounter } from "@sindresorhus/slugify";

import { Layout } from "@/components/Layout";
import Script from "next/script";

import "focus-visible";
import "../lib/diffViewerStyle.css";

import "@/styles/tailwind.css";

function getNodeText(node) {
    let text = "";
    for (let child of node.children ?? []) {
        if (typeof child === "string") {
            text += child;
        }
        text += getNodeText(child);
    }
    return text;
}

function collectHeadings(nodes, slugify = slugifyWithCounter()) {
    let sections = [];

    for (let node of nodes) {
        if (node.name === "h2" || node.name === "h3") {
            let title = getNodeText(node);
            if (title) {
                let id = slugify(title);
                node.attributes.id = id;
                if (node.name === "h3") {
                    if (!sections[sections.length - 1]) {
                        throw new Error(
                            "Cannot add `h3` to table of contents without a preceding `h2`"
                        );
                    }
                    sections[sections.length - 1].children.push({
                        ...node.attributes,
                        title,
                    });
                } else {
                    sections.push({ ...node.attributes, title, children: [] });
                }
            }
        }

        sections.push(...collectHeadings(node.children ?? [], slugify));
    }

    return sections;
}

export default function App({ Component, pageProps }) {
    let { notProse = false, nextPrev = true } = Component.wrapped || Component;
    let title = pageProps.markdoc?.frontmatter.title;

    let pageTitle =
        pageProps.markdoc?.frontmatter.pageTitle ||
        `${pageProps.markdoc?.frontmatter.title || "untitled page"}`;
    console.log({pageProps})
    
    let description = pageProps.markdoc?.frontmatter.description;

    let tableOfContents = pageProps.markdoc?.content
        ? collectHeadings(pageProps.markdoc.content)
        : [];

    const GA_ID = "XXXX!!!customize";
    // console.log("rendering app", Component, pageProps);
    return (
        <>
            <Head>
                {/* <Script async src={`https://www.googletagmanager.com/gtag/js?id={GA_ID}`}></Script>
        <Script type='text/javascript' children={`
        if (typeof window !== 'undefined') {
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments)}
            gtag('js', new Date());

            gtag('config', '${GA_ID}');
        } 
            `} /> */}
                {/* <title>{pageTitle}</title> */}
                {description && (
                    <meta name="description" content={description} />
                )}
            </Head>
            <Layout {...{ title, tableOfContents, notProse, nextPrev }}>
                <Component {...pageProps} />
            </Layout>
        </>
    );
}
