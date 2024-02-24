"use client";

import type { NextPageContext } from "next";
import head from "next/head.js";
const Head = head.default;
import { useRouter } from "next/router.js";
import React, { useState } from "react";
// import { createPortal } from "react-dom";
// import { Prose } from "@/components/Prose.jsx";
// import { useLiveQuery } from "dexie-react-hooks";
import type { BookEntryOnchain, BookEntryForUpdate, forOnChainEntry, BookIndexEntry, BookEntryCreationAttrs, BookEntryUpdateAttrs } from "../../contracts/CMDBCapo.js";
import { helios } from "@donecollectively/stellar-contracts";
import { Markdoc } from "../../components/Markdoc.jsx";
import type { BookManagementProps } from "./sharedPropTypes.js";
import { Button } from "../../components/Button.jsx";

import link from "next/link.js";
import { DiffViewer } from "../../lib/DiffViewer.jsx";
import { Prose } from "../../components/Prose.jsx";
const Link = link.default

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hWallet = typeof Cip30Wallet.prototype;

type propsType = {
    entry?: BookIndexEntry;
    // editingEntry?:  BookEntryUpdateAttrs;
    creatingEntry?: BookEntryCreationAttrs;
    wallet?: hWallet;
    preview? : true
} & BookManagementProps

type stateType = {
    rendered: boolean
}

export class PageView extends React.Component<propsType, stateType> {
    get mgr() {
        return this.props.bookMgrDetails;
    }

    render() {
        const {rendered} = this.state || {}
        if (!rendered) setTimeout(() => this.setState({rendered:true}), 10);

        const {
            entry: { pageEntry, pendingChanges=[] } = {},
            creatingEntry,
            preview,
        } = this.props;
        const {
            wallet,
        } = this.mgr

        const page = creatingEntry ||  pageEntry.updated || pageEntry.entry;

        const altTitles = pendingChanges.map(x => {
            const {entry: {title}, id } = x.change
            if (!title) return undefined;
            return { title, id }
        }).filter(x => !!x)

        const pageContent = page.content;
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
                {preview || <Head>
                    <title>
                        {page.title}
                    </title>
                </Head>}

                <h2>{page.title}</h2>
                {altTitles.map( 
                    ({title, id}) => {
                        if (!title || title == page.title) return null;
                        return  <h3><span className="text-"> -or- </span>{title}</h3>
                    }
                )}
                <Prose className={``}>
                    <Markdoc content={pageContent} />
                </Prose>
                {false && <div>                
                    {pageEntry?.updated?.content && 
                        /* a diff for edits*/ <DiffViewer oldVersion={pageEntry.entry.content} newVersion={pageEntry.updated.content} />
                        || /* existing or new-page without diff */ <DiffViewer oldVersion={page.content} newVersion={page.content} />
                    }   
                    {/* <Markdoc content={pageContent} /> */}
                </div>}
                {this.mgr.wallet && this.mgr.roles?.includes("collaborator") || !this.mgr.connectingWallet ||
                    <div className="italic text-right text-xs text-[#ccc]">No editing permission; request collaborator privileges from this project's editor</div>
                }
            </>
        );
    }

    possibleEditButton() {
        const {walletUtxos, bookContract, roles} = this.mgr;
        if (this.props.preview) return null;        
        if (!walletUtxos) return "..."; // undefined

        if (roles?.includes("collaborator")) {
            const eid = this.props.entry?.pageEntry.id;
            if (!eid) return null;
            return <Button href={`${eid}/edit`}>Update Listing</Button>
        }
    }
}
