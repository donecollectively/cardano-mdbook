import React, { useEffect, useRef } from "react";
import {
    MarkdownParser,
    // MarkdownParser,
    // schema as markdownSchema,
    defaultMarkdownParser,
} from "prosemirror-markdown";
// import { schema as baseSchema } from "prosemirror-schema-basic";
// import { addListNodes } from "prosemirror-schema-list";
// import { Node, Schema, DOMSerializer } from "prosemirror-model";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { ChangeSet } from "prosemirror-changeset";

import { hasReqts } from "@donecollectively/stellar-contracts";
import { mkDiffTransform } from "./prosemirror-differ.js";
import { Mark, MarkType, type Node } from "prosemirror-model";
import { DOMOutputSpec, Schema } from "prosemirror-model";

// thanks to https://codesandbox.io/p/sandbox/prosemirror-diff-nuhiiq for its example as a starting point
// and https://codesandbox.io/p/sandbox/zb5v0k for paving the way earlier.
// and for the markdown and changeset libs
// and prosemirror itself

const schema = new Schema({
    nodes: defaultMarkdownParser.schema.spec.nodes,
    marks: defaultMarkdownParser.schema.spec.marks
        .addToEnd("del", {
            parseDOM: [{ tag: "del" }],
            toDOM(mark: Mark): DOMOutputSpec {
                return ['del', { class: "diff deletion", style: `background: #ff000033;`,  }, 0];
              },
        })
        .addToEnd("ins", {
            attrs: { class: { default: "diff insertion" } },
            parseDOM: [{ tag: "ins" }],
            toDOM(mark: Mark): DOMOutputSpec {
                return ['ins', { class: "diff insertion", style: `background: #00ff0033;`,  }, 0];
              },
        }),
});

const parser = new MarkdownParser(schema,
    defaultMarkdownParser.tokenizer,
    defaultMarkdownParser.tokens)

export const DiffViewer = ({ oldVersion, newVersion }) => {
    const domRefDiff = useRef(null);
    //   const domRefNew = useRef(null);
    //   const domRefOld = useRef(null);

    useEffect(() => {
        const { current: mountElDiff } = domRefDiff;
        // const { current: mountElNew } = domRefNew;
        // const { current: mountElOld } = domRefOld;
        if (mountElDiff === null) {
            return;
        }
        const docOld = parser.parse(oldVersion);
        if (!docOld) throw new Error("no docOld");
        const docNew = parser.parse(newVersion) || undefined;
        if (!docNew) throw new Error("no docNew");

        // const stateOld = EditorState.create({ doc: docOld });
        // const viewOld = new EditorView(mountElOld, { state: stateOld });

        // const stateNew = EditorState.create({ doc: docNew });
        // const viewNew = new EditorView(mountElNew, { state: stateNew });
debugger
        let tr = mkDiffTransform(docOld, docNew, true);
        alert('ok: ' + docOld.textContent +  " -> " + docNew.textContent );
        debugger;
        // let decoration = DecorationSet.empty;
        // let chgSet = ChangeSet.create(docOld).addSteps(
        //     tr.doc,
        //     tr.mapping.maps,
        //     {}
        // );

        // for (const change of chgSet.changes) {
        //     console.log("DIFF: ", change);
        //     decoration = decoration.add(tr.doc, [
        //         Decoration.inline(
        //             change.fromB,
        //             change.toB,
        //             { class: "diff insertion" },
        //             {}
        //         ),
        //         Decoration.inline(change.fromA, change.toA, {
        //             nodeName: "del",
        //         }),
        //     ]);
        // }
        debugger
        const stateDiff = EditorState.create({
            doc: tr.doc,
            plugins: [
                // new Plugin({
                //     key: new PluginKey("diffs"),
                //     props: {
                //         decorations(state) {
                //             return decoration;
                //         },
                //     },
                //     filterTransaction: (tr) => false,
                // }),
            ],
        });
        const viewDiff = new EditorView(mountElDiff, { state: stateDiff });

        return () => {
            viewDiff.destroy();
        };
    }, [oldVersion, newVersion]);

    return (
        <article>
            <div className="editor-container" ref={domRefDiff} />
        </article>
    );
};

DiffViewer.reqts = hasReqts({
    "analyzes semantic document changes": {
        purpose: "to show the differences between two versions of a document",
        details: [
            "The component should be able to take in two versions of a document and show the differences between them",
            "The component should be able to show the differences in a way that is easy to read and understand",
        ],
        mech: [],
        requires: ["shows added text with <ins>"],
    },

    "shows added text with <ins>": {
        purpose: "to reflect text added in the new version",
        details: [],
        mech: ["new text is wrapped in <ins> tags"],
    },

    "shows removed text with <del>": {
        purpose: "to reflect text removed in the new version",
        details: [],
        mech: [
            "removed text is wrapped in <del> tags",
            "TODO: removed text isn't editable",
        ],
    },

    "changed text is simply a combination of removed and added text": {
        purpose: "to reflect text that has been changed",
        details: [],
        mech: ["changed text combines the <del> and <ins> tags"],
    },

    "shows formatting changes": {
        purpose:
            "shows bold, italic, and other formatting changes that were made",
        details: [],
        mech: [
            "formatting changes are reflected by an inline span showing which marks were added or removed",
            "multiple formatting changes at a single spot are combined into a single span reflecting all changes",
        ],
    },
});
