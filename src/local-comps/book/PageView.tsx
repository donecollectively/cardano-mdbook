"use client";

import type { NextPageContext } from "next";
import { useRouter } from "next/router.js";
import React, { useState } from "react";
import { createPortal } from "react-dom";

import head from "next/head.js";
const Head = head.default;
import link from "next/link.js";
const Link = link.default;

// import { Prose } from "@/components/Prose.jsx";
// import { useLiveQuery } from "dexie-react-hooks";
import { helios } from "@donecollectively/stellar-contracts";
import type {
    BookEntryOnchain,
    BookEntryForUpdate,
    forOnChainEntry,
    BookIndexEntry,
    BookEntryCreationAttrs,
    BookEntryUpdateAttrs,
    ChangeDetails,
} from "../../contracts/CMDBCapo.js";
import { Markdoc } from "../../components/Markdoc.jsx";
import type { hasBookMgr, isBookMgr } from "./sharedPropTypes.js";
import { Button } from "../../components/Button.jsx";

import { DiffViewer } from "../../lib/DiffViewer.jsx";
import { Prose } from "../../components/Prose.jsx";
import { diff_match_patch } from "../../diff-match-patch-uncompressed.js";

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hWallet = typeof Cip30Wallet.prototype;

type propsType = {
    entry?: BookIndexEntry;
    // editingEntry?:  BookEntryUpdateAttrs;
    creatingEntry?: BookEntryCreationAttrs;
    wallet?: hWallet;
    change?: ChangeDetails;
    preview?: true;
} & hasBookMgr;

type stateType = {
    rendered: boolean;
};

export class PageView extends React.Component<propsType, stateType> {
    get mgr() {
        return this.props.mgr;
    }

    render() {
        const { rendered } = this.state || {};
        if (!rendered) setTimeout(() => this.setState({ rendered: true }), 10);
        const portalTarget = document?.getElementById("sidebar");

        const {
            entry: { pageEntry, pendingChanges = [] } = {},
            creatingEntry,
            preview,
            change,
        } = this.props;
        const { id } = pageEntry;
        const { wallet } = this.mgr;

        const page = creatingEntry || pageEntry.updated || pageEntry.entry;

        const altTitles = pendingChanges
            .map((x) => {
                const {
                    entry: { title },
                    id,
                } = x.change;
                if (!title) return undefined;
                return { title, id };
            })
            .filter((x) => !!x);

        let pageContent = page.content;
        let patched = "";
        let patch = change?.change?.entry?.content;
        let currentChange = change?.change?.id;
        let error = "";
        if (change) {
            try {
                patched = this.mgr.bookContract.applyPatch(patch, pageContent);
            } catch (e) {
                error = `Error patching document: ${e.message}`;
            }
        }
        let diff = diff_lineMode(pageContent, patched);
        // const tt =  new Address("addr1qx6p9k4rq077r7q4jdkv7xfz639tts6jzxsr3fatqxdp2y9w9cdd2uueqwnv0cw9gne02c0mzrvfsrk884lry7kpka8shpy5qw")
        // const ttt = Address.fromHash(tt.pubKeyHash, false)
        // {ttt.toBech32()}

        return (
            <>
                {wallet && (
                    <div className="float-right">
                        {this.possibleEditButton()}
                    </div>
                )}
                {preview || (
                    <Head>
                        <title>{page.title}</title>
                    </Head>
                )}

                <h2>{page.title}</h2>

                {altTitles.map(({ title, id }) => {
                    if (!title || title == page.title) return null;
                    return (
                        <h3>
                            <span className="text-"> -or- </span>
                            {title}
                        </h3>
                    );
                })}
                {change && (
                    <>
                        <Prose className="text-[#ccc]">
                            <h4 className="mt-2 ml-4 -mb-3">Proposed Change</h4>
                            <pre className="pt-4">
                                {decodeURIComponent(diff)}
                            </pre>
                        </Prose>
                        {!error && (
                            <div>
                                <h4 className="mt-2 ml-4 -mb-3">Preview</h4>
                                <Prose
                                    className={`px-2 pt-0 border-2 border-dotted border-sky-900/40`}
                                >
                                    <Markdoc content={patched || pageContent} />
                                </Prose>
                            </div>
                        )}
                    </>
                )}
                {change && !error ? (
                    ""
                ) : (
                    <>
                        {error && <div className="text-red-700">{error}</div>}
                        {error && <div>Unmodified document shown below</div>}
                        <Prose className="">
                            <Markdoc content={patched || pageContent} />
                        </Prose>
                    </>
                )}
                {false && (
                    <div>
                        {(pageEntry?.updated?.content && (
                            /* a diff for edits*/ <DiffViewer
                                oldVersion={pageEntry.entry.content}
                                newVersion={pageEntry.updated.content}
                            />
                        )) || (
                            /* existing or new-page without diff */ <DiffViewer
                                oldVersion={page.content}
                                newVersion={page.content}
                            />
                        )}
                        {/* <Markdoc content={pageContent} /> */}
                    </div>
                )}
                {(this.mgr.wallet &&
                    this.mgr.roles?.includes("collaborator")) ||
                    !this.mgr.connectingWallet || (
                        <div className="italic text-right text-xs text-[#ccc]">
                            No editing permission; request collaborator
                            privileges from this project's editor
                        </div>
                    )}
                {this.changes.length &&
                    createPortal(
                        <Prose className={``}>
                            <h3>Proposed Changes</h3>

                            {this.changes.map((x, i) => (
                                <ChangePreviewUI
                                    {...{
                                        change: x,
                                        mgr: this.mgr,
                                        docId: id,
                                        currentChange
                                    }}
                                />
                            ))}
                        </Prose>,
                        portalTarget
                    )}
            </>
        );
    }

    get changes() {
        return this.props.entry.pendingChanges;
    }

    possibleEditButton() {
        const { walletUtxos, bookContract, roles } = this.mgr;
        if (this.props.preview) return null;
        if (!walletUtxos) return "..."; // undefined

        if (roles?.includes("collaborator")) {
            const eid = this.props.entry?.pageEntry.id;
            if (!eid) return null;
            return <Button href={`${eid}/edit`}>Update Listing</Button>;
        }
    }
}

type ChangePreviewProps = {
    docId: string;
    change: ChangeDetails;
    mgr: isBookMgr;
    currentChange? : string
};

function ChangePreviewUI({ docId, change, mgr, currentChange }: ChangePreviewProps) {
    const {
        change: {
            ownerAuthority: { uutName: createdBy },
            id: changeId,
            entry: { title, content, updatedAt, createdAt, updatedBy },
        },
    } = change;
    const ts = new Date(Number(updatedAt || createdAt)).toLocaleString();
    const selectedClass = currentChange === changeId ? "bg-slate-950/40 text-slate-300 border-l-2" : "";
    return (
        <div
            key={changeId}
            className={`text-sm p-2 ${selectedClass} dark:hover:bg-slate-950 dark:hover:text-slate-300 dark:focus:bg-slate-950 dark:focus:text-slate-300`}
        >
            <h4 className="mt-0">{ts}</h4>
            <Link href={mgr.pageViewUrl(docId, changeId)}>
                {changeId} from {createdBy} {updatedBy && ","} {updatedBy}
            </Link>
        </div>
    );
}

function diff_lineMode(text1, text2) {
    var dmp = new diff_match_patch();
    //@ts-expect-error
    var a = dmp.diff_linesToChars_(text1, text2);
    var lineText1 = a.chars1;
    var lineText2 = a.chars2;
    var lineArray = a.lineArray;
    var diffs = dmp.diff_main(lineText1, lineText2, false);
    //@ts-expect-error
    dmp.diff_charsToLines_(diffs, lineArray);
    dmp.diff_cleanupSemantic(diffs);
    let prettyDiff = "";
    let state: "preContext" | "showChange" | "postContext";
    state = "preContext";
    let preContext = "";
    for (var x = 0; x < diffs.length; x++) {
        const diff = diffs[x];
        let { 0: op, 1: txt } = diff;
        txt = txt.replace(/\\([\[\]])/g, "$1");
        if (op !== 0) {
            state = "showChange";
        }
        // if (state == "showChange" && op === 0) {
        //     state = "postContext";
        // }
        if (state === "preContext") {
            preContext = txt;
        }
        if (state === "showChange") {
            if (preContext) {
                const sliced = preContext.split("\n").slice(-5);
                const marker = " "; // a space
                if (!sliced.at(-1)) sliced.pop();
                if (sliced.at(0) == "\n") sliced.unshift();
                prettyDiff += sliced.map((x) => `${marker}${x}\n`).join("");

                preContext = "";
            }
            const marker = op === 1 ? "+" : op === -1 ? "-" : " ";

            const sliced = txt.split("\n");
            if (!sliced.at(-1)) sliced.pop();
            prettyDiff += sliced.map((x) => `${marker}${x}\n`).join("");
            state = "postContext"; // on next iteration
        } else if (state === "postContext") {
            const marker = " "; // a space
            prettyDiff += txt
                .split("\n")
                .slice(0, 3)
                .map((x) => `${marker}${x}`)
                .join("\n");
            preContext = txt.slice(3);
        }
    }
    return prettyDiff;
}
