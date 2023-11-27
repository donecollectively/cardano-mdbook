"use client";

import { NextPageContext } from "next";
import head from "next/head.js";
const Head = head.default;
import { useRouter } from "next/router.js";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Prose } from "@/components/Prose.jsx";
import { useLiveQuery } from "dexie-react-hooks";
import { RegisteredCredentialOnchain, RegisteredCredentialForUpdate } from "../../contracts/CCRegistry.js";
import { Markdoc } from "../Markdoc.js";
import { helios } from "@donecollectively/stellar-contracts";
import { ClientSideOnly } from "../ClientSideOnly.js";
import { inPortal } from "../../inPortal.js";
import { credRegistryProps } from "./sharedPropTypes.js";
import { Button } from "../Button.js";
import link from "next/link.js"; const Link = link.default

// ViewCert.getInitialPXXrops = async (ctx) => {
//     const { id } = ctx.query
//     if ("undefined" == typeof window) return {}

//     await new Promise((r) => setTimeout(r, 400))
//     return { sidebar: [<div>hi sidebar {id}</div>] }
//     const res = await fetch("https://api.github.com/repos/vercel/next.js")
//     const json = await res.json()
//     return { stars: json.stargazers_count }
// }
const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hWallet = typeof Cip30Wallet.prototype;

type propsType = {
    cred: RegisteredCredentialForUpdate;
    wallet?: hWallet;
    preview? : true
} & credRegistryProps

type stateType = {
    rendered: boolean
}

export class CredView extends React.Component<propsType, stateType> {
    render() {
        const {rendered} = this.state || {}
        if (!rendered) setTimeout(() => this.setState({rendered:true}), 10);
        // const [posts, setPosts] = useState(null);
        // useEffect(() => {    fetchPosts().then(p => setPosts(p));  }, []);
        console.log(
            "--------------------------------------------------------------------------------- cert view render"
        );
        const {
            cred: { cred },
            wallet,
            preview,
            credsRegistry,
        } = this.props;
        const metaTable = (
            <Prose className="">
                <table className="mt-16 table-auto text-gray-400">
                    <tbody>
                        <tr>
                            <th>
                                <strong>Issued by</strong>
                            </th>
                            <td>
                                {cred.issuerName}
                            </td>
                        </tr>
                        {/* <tr>
                            <th>Registration space</th>
                            <td>
                                <strong>???? Cardano on-chain</strong>
                            </td>
                        </tr> */}
                        <tr>
                            <th><strong>Issuance platform</strong></th>
                            <td>
                                {cred.issuancePlatform || "‹unspecified›"}
                                {/* <strong>??? AtalaPRISM via LearnerShape</strong> */}
                            </td>
                        </tr>
                        <tr>
                            <th><strong>Issuance URL</strong></th>
                            <td>
                                {cred.issuanceUrl ? 
                                    <Link href={cred.issuanceUrl}>click here</Link>
                                    : <>‹none›</>
                                }
                            </td>
                        </tr>
                        {/* <tr>
                            <th>Verification Service</th>
                            <td>
                                <strong>???</strong>
                            </td>
                        </tr> */}
                    </tbody>
                </table>
            </Prose>
        );

        let sidebarMetaTable = preview ? metaTable : (
            <ClientSideOnly>
                {inPortal(
                    "sidebar",
                    <div className="hidden lg:block">{metaTable}</div>
                )}
            </ClientSideOnly>
        );

        // const tt =  new Address("addr1qx6p9k4rq077r7q4jdkv7xfz639tts6jzxsr3fatqxdp2y9w9cdd2uueqwnv0cw9gne02c0mzrvfsrk884lry7kpka8shpy5qw")
        // const ttt = Address.fromHash(tt.pubKeyHash, false)
        // {ttt.toBech32()}

        return (
            <>
                <Head>
                    <title>
                        Certificate:
                        {cred.credName} by {cred.issuerName}
                    </title>
                </Head>

                {wallet && (
                    <div className="float-right">
                        {this.possibleEditButton()}
                    </div>
                )}
                <h2>{cred.credName}</h2>
                <div>
                    <h4>
                        Certificate Description{" "}
                        {/* <span className="text-slate-700">
                            {cred.credSummary}
                        </span> */}
                    </h4>
                    <Markdoc content={cred.credDesc} />
                    <h4>Expectations of a Credential Holder</h4>
                    <div className="hidden">
                        Skills, Capabilities / Experience
                    </div>
                    <ul className={`not-prose checklist`}>
                        {cred.expectations
                            .filter((x) => !!x)
                            .map((expectation, i) => (
                                <li key={`exp-${i}`}>{expectation}</li>
                            ))}
                    </ul>
                </div>
                <h4>Issuance requirements / Governance Process</h4>

                <Markdoc content={cred.issuingGovInfo} />

                <div className="block lg:hidden">
                    <hr />
                    {metaTable}
                </div>
                {sidebarMetaTable}
            </>
        );
    }

    possibleEditButton() {
        const {walletUtxos, credsRegistry, cred} = this.props;
        if (!walletUtxos) return "...loading wallet utxos..."; // undefined
        // const delegateToken = credsRegistry.tvForDelegate(cred.credAuthority)
        const tokenPredicate = credsRegistry.mkDelegatePredicate(cred.credAuthority)
        const foundToken = walletUtxos.find(tokenPredicate)
        if (!foundToken) return "no tokens" //undefined

        return <Button href={`${cred.id}/edit`}>Update Listing</Button>
    }
}
