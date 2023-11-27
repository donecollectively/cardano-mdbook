"use client";

import { NextPageContext } from "next";
import head from "next/head.js";
const Head = head.default;
import { useRouter } from "next/router.js";
import React, { useState } from "react";
// import { createPortal } from "react-dom";
// import { Prose } from "@/components/Prose.jsx";
// import { useLiveQuery } from "dexie-react-hooks";
import { BookEntryOnchain, BookEntryForUpdate } from "../../contracts/CMDBCapo.js";
import { helios } from "@donecollectively/stellar-contracts";
import { Markdoc } from "../../components/Markdoc.jsx";
import { BookManagementProps } from "./sharedPropTypes.js";
import { Button } from "../../components/Button.jsx";

import link from "next/link.js";
const Link = link.default

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hWallet = typeof Cip30Wallet.prototype;

type propsType = {
    cred: BookEntryForUpdate;
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
            cred: { cred: page },
            wallet,
            preview,
        } = this.props;

        // const tt =  new Address("addr1qx6p9k4rq077r7q4jdkv7xfz639tts6jzxsr3fatqxdp2y9w9cdd2uueqwnv0cw9gne02c0mzrvfsrk884lry7kpka8shpy5qw")
        // const ttt = Address.fromHash(tt.pubKeyHash, false)
        // {ttt.toBech32()}

        return (
            <>
                <Head>
                    <title>
                        {page.pageTitle}
                    </title>
                </Head>

                {wallet && (
                    <div className="float-right">
                        {this.possibleEditButton()}
                    </div>
                )}
                <h2>{page.pageTitle}</h2>
                <div>
                    <Markdoc content={page.pageContent} />
                </div>
            </>
        );
    }

    possibleEditButton() {
        const {walletUtxos, bookContract, cred} = this.props;
        if (!walletUtxos) return "...loading wallet utxos..."; // undefined

        const tokenPredicate = bookContract.mkDelegatePredicate(cred.credAuthority)
        const foundToken = walletUtxos.find(tokenPredicate)
        if (!foundToken) return "no tokens" //undefined

        return <Button href={`${cred.id}/edit`}>Update Listing</Button>
    }
}
