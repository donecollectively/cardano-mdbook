"use client";

import type { NextPageContext } from "next";
import head from "next/head.js";
const Head = head.default;
import { useRouter } from "next/router.js";
import React, { useState } from "react";
// import { createPortal } from "react-dom";
// import { Prose } from "@/components/Prose.jsx";
// import { useLiveQuery } from "dexie-react-hooks";
import type { BookEntryOnchain, BookEntryForUpdate, forOnChainEntry, BookIndexEntry } from "../../contracts/CMDBCapo.js";
import { helios } from "@donecollectively/stellar-contracts";
import { Markdoc } from "../../components/Markdoc.jsx";
import type { BookManagementProps } from "./sharedPropTypes.js";
import { Button } from "../../components/Button.jsx";

import link from "next/link.js";
const Link = link.default

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hWallet = typeof Cip30Wallet.prototype;

type propsType = {
    entry: BookIndexEntry;
    wallet?: hWallet;
    preview? : true
} & BookManagementProps

type stateType = {
    rendered: boolean
}

export class PageView extends React.Component<propsType, stateType> {
    render() {
        const {rendered} = this.state || {}
        if (!rendered) setTimeout(() => this.setState({rendered:true}), 10);

        const {
            entry: { pageEntry, pendingChanges=[] },
            wallet,
            preview,
        } = this.props;

        const {
            entry: page
        }= pageEntry;

        const altTitles = pendingChanges.map(x => {
            const {entry: {title}, id } = x.change
            if (!title) return undefined;
            return { title, id }
        }).filter(x => !!x)
        debugger
        const pageContent = page.content;
        // const tt =  new Address("addr1qx6p9k4rq077r7q4jdkv7xfz639tts6jzxsr3fatqxdp2y9w9cdd2uueqwnv0cw9gne02c0mzrvfsrk884lry7kpka8shpy5qw")
        // const ttt = Address.fromHash(tt.pubKeyHash, false)
        // {ttt.toBech32()}

        return (
            <>
                {preview || <Head>
                    <title>
                        {page.title}
                    </title>
                </Head>}

                {wallet && (
                    <div className="float-right">
                        {this.possibleEditButton()}
                    </div>
                )}
                <h2>{page.title}</h2>
                {altTitles.map( 
                    ({title, id}) => <h3><span className="text-"> -or- </span>{title}</h3>
                )}

                <div>
                    <Markdoc content={pageContent} />
                </div>
                {this.props.wallet && this.props.roles?.includes("collaborator") || !this.props.connectingWallet ||
                    <div className="italic text-right text-xs text-[#ccc]">No editing permission; request collaborator privileges from this project's editor</div>
                }
            </>
        );
    }

    possibleEditButton() {
        const {walletUtxos, bookContract, entry, roles} = this.props;
        if (!walletUtxos) return "...loading wallet utxos..."; // undefined

        if (roles?.includes("collaborator")) {
            //@ts-expect-error  on entry-id
            const eid = entry.id;
            if (!eid) return null;
            return <Button href={`${eid}/edit`}>Update Listing</Button>
        }
    }
}
