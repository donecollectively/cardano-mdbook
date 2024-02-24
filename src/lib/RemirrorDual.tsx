import "@remirror/styles/all.css";

import { css } from "@emotion/css";
import { createContextState } from "create-context-state";
import React from "react";
import jsx from "refractor/lang/jsx.js";
import md from "refractor/lang/markdown.js";
import typescript from "refractor/lang/typescript.js";
import { ExtensionPriority } from "remirror";
import {
    BlockquoteExtension,
    BoldExtension,
    BulletListExtension,
    CodeBlockExtension,
    CodeExtension,
    DocExtension,
    HardBreakExtension,
    HeadingExtension,
    ItalicExtension,
    LinkExtension,
    ListItemExtension,
    MarkdownExtension,
    OrderedListExtension,
    StrikeExtension,
    TableExtension,
    TrailingNodeExtension,
} from "remirror/extensions";
import {
    MarkdownToolbar,
    ReactExtensions,
    Remirror,
    ThemeProvider,
    useHelpers,
    useRemirror,
    UseRemirrorReturn,
} from "@remirror/react";
import { MarkdownEditor } from "@remirror/react-editors/markdown";
import { RemirrorDiffCaptureExtension } from "./RemirrorDiffCaptureExtension.js";

function mkSpace(n: number) {
    return `${0.5 * n}rem`;
}

interface Context extends Props {
    setMarkdown: (markdown: string) => void;
    setVisual: (markdown: string) => void;
}

interface Props {
    visual: UseRemirrorReturn<
        ReactExtensions<ReturnType<typeof extensions>[number]>
    >;
    markdown: UseRemirrorReturn<
        ReactExtensions<DocExtension | CodeBlockExtension>
    >;
}

const [DualEditorProvider, useDualEditor] = createContextState<Context, Props>(
    ({ props }) => ({
        ...props,

        setMarkdown: (text: string) =>
            props.markdown.getContext()?.setContent({
                type: "doc",
                content: [
                    {
                        type: "codeBlock",
                        attrs: { language: "markdown" },
                        content: text ? [{ type: "text", text }] : undefined,
                    },
                ],
            }),
        setVisual: (markdown: string) =>
            props.visual.getContext()?.setContent(markdown),
    })
);

const MarkdownTextEditor = ({ onChange }: hasChangeHandler) => {
    const { visual, setMarkdown, markdown, setVisual } = useDualEditor();

    // diffs plugin needs to rely on the rich text editor's positions, which are difficult to reconcile
    // with mode-switching to raw markdown.  Consider augmenting the rich text editor to render
    // Markdown symbols so that it feels like both rich AND markdown, and so the raw markdown editor
    // can be removed.
    throw new Error(`text editor not compatible with current change-capture plugin`)

    return (
        <>
            <Remirror
                manager={markdown.manager}
                autoRender="end"
                onChange={({ helpers, state }) => {
                    // const md = helpers.getMarkdown(state);
                    const md = helpers.getText({ state });
                    onChange(md, "");
                    return setVisual(md);
                }}
                // initialContent={visual.state}

                classNames={[
                    "not-prose",
                    css`
                        &.ProseMirror {
                            padding: 0;
                            background: #000;
                            pre {
                                background: #000 !important;
                                height: 100%;
                                padding: ${mkSpace(1)};
                                margin: 0;

                                & .title:not(.punctuation) {
                                    font-size: 118%;
                                    color: #7055aa;
                                }
                                & .punctuation,
                                .token.title.punctuation {
                                    color: #75fb;
                                    font-size: 105%;
                                }
                                & .italic:not(.punctuation) {
                                    color: #dbb;
                                    font-size: 102%;
                                    font-style: italic;
                                }
                                & .italic.punctuation {
                                    color: #a75;
                                    font-size: 105%;
                                    padding-left: 2px;
                                }
                                & .bold:not(.punctuation) {
                                    color: #bbb;
                                    font-weight: 900;
                                    font-size: 102%;
                                }
                                & .bold.italic:not(.punctuation) {
                                    color: #dbb;
                                    font-style: italic;
                                    font-weight: 900;
                                    font-size: 104%;
                                }

                                font-size: 1rem;
                                font-family: "Lato", sans-serif;
                                font-weight: 700;
                                font-style: normal;

                                code {
                                    font-size: 1rem;
                                    font-family: "Lato", sans-serif;
                                    font-weight: 700;
                                    font-style: normal;
                                    color: #999;
                                }
                            }

                            font-size: 1rem;
                            scrollbar-color: #0f172a #0f172a66;
                            scrollbar-width: thin;
                        }
                    `,
                ]}
            >
                {/* <Toolbar items={toolbarItems} refocusEditor label='Top Toolbar' /> */}
            </Remirror>
        </>
    );
};

const VisualEditor = ({ onChange }: hasChangeHandler) => {
    const { visual, setMarkdown, markdown, setVisual } = useDualEditor();

    return (
        <div
            style={
                {
                    /* display:"none" */
                }
            }
        >
            <Remirror
                autoFocus
                manager={visual.manager}
                autoRender="end"
                onChange={({ helpers, state }) => {
                    const md = helpers.getMarkdown(state);
                    //@ts-expect-error
                    let diffs = state.diffCapture$?.diffs || ""

                    if (diffs) diffs = JSON.stringify(diffs)
                    // if (state.diffCapture$ ) debugger;
                    onChange(md, diffs);
                    setMarkdown(md);
                }}
                initialContent={visual.state}
                classNames={[
                    css`
                        &.ProseMirror {
                            font-family: "Lato", sans-serif;
                            font-weight: 700;
                            font-style: normal;

                            font-size: 1rem;
                            scrollbar-color: #0f172a #0f172a66;
                            scrollbar-width: thin;
                            h3,
                            h4 {
                                color: #7055aa99;
                                margin-top: ${mkSpace(1)};
                                margin-bottom: ${mkSpace(1)};
                            }
                            h3 {
                                color: #7055aaaa;
                                margin-bottom: ${mkSpace(1.1)};
                            }
                            ul {
                                margin-bottom: ${mkSpace(1)};
                            }
                            h1,
                            h2 {
                                color: #7055aa;
                                margin-top: ${mkSpace(1.3)};
                                margin-bottom: ${mkSpace(1)};
                                &:first-child {
                                    margin-top: 0;
                                }
                            }
                            h2 {
                                color: #7055aacc;
                                margin-top: ${mkSpace(1.1)};
                                margin-bottom: ${mkSpace(1.2)};
                            }
                            & p {
                                color: #999;
                                margin-bottom: ${mkSpace(2)};
                            }
                            strong {
                                color: #ccc;
                                font-weight: 900;
                                font-size: 108%;
                            }
                        }
                        &.remirror-editor
                            .remirror-ul-list-content
                            > li.remirror-list-item-with-custom-mark {
                            list-style: disc;
                            margin-bottom: ${mkSpace(1.5)};
                        }
                        &.remirror-editor
                            ul
                            > li.remirror-list-item-with-custom-mark {
                            list-style: disc;
                            margin-bottom: ${mkSpace(1.5)};
                        }
                    `,
                ]}
            >
                <MarkdownToolbar />
            </Remirror>
        </div>
    );
};
export type hasChangeHandler = {
    onChange: (value: string, diffsJson: string) => void;
};

export type DualEditorProps = hasChangeHandler & {
    defaultValue: string;
};
/**
 * The editor which is used to create the annotation. Supports formatting.
 */
export const DualEditor = (props: DualEditorProps) => {
    const { onChange, defaultValue } = props;

    const visual = useRemirror({
        extensions,
        stringHandler: "markdown",
        content: defaultValue,
    });

    const markdown = useRemirror({
        extensions: () => [
            new DocExtension({ content: "codeBlock" }),
            new CodeBlockExtension({
                supportedLanguages: [md, typescript],
                defaultLanguage: "markdown",
                syntaxTheme: "base16_ateliersulphurpool_light",
                defaultWrap: true,
            }),
        ],
        builtin: {
            exitMarksOnArrowPress: false,
        },
        content: defaultValue,
        stringHandler: "html",
    });

    return (
        <DualEditorProvider visual={visual} markdown={markdown}>
            <ThemeProvider>
                <VisualEditor {...{ onChange }} />
                {/* <MarkdownTextEditor  {...{onChange}}/> */}
            </ThemeProvider>
        </DualEditorProvider>
    );
};

const extensions = () => [
    new LinkExtension({ autoLink: true }),
    new BoldExtension({}),
    new StrikeExtension(),
    new ItalicExtension(),
    new HeadingExtension({}),
    new BlockquoteExtension(),
    new BulletListExtension({ enableSpine: true }),
    new OrderedListExtension(),
    new RemirrorDiffCaptureExtension(),
    new ListItemExtension({
        priority: ExtensionPriority.High,
        enableCollapsible: true,
    }),
    new CodeExtension(),
    new CodeBlockExtension({ supportedLanguages: [jsx, typescript] }),
    new TrailingNodeExtension(),
    new TableExtension(),
    new MarkdownExtension({ copyAsMarkdown: false }),
    /**
     * `HardBreakExtension` allows us to create a newline inside paragraphs.
     * e.g. in a list item
     */
    new HardBreakExtension(),
];
