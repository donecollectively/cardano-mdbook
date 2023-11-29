"use client";

// Making your own Cardano MDBook?
//   First, use the "null" config here.
//   Next, charter your MDBook using the guide in the README file.
//   Paste the configuration in place of the non-null config structure below.
//
//
// const CMDB_BookContractConfig = null

//!!! comment out the following block while using the "null" config.
const CMDB_BookContractConfig = {
    mph: {
        bytes: "e70140a7f9383d8a8a512aec01c02b1b0d3b6a1ef35378390ef8e187",
    },
    rev: "1",
    seedTxn: {
        bytes: "a222e13f5904ca4ef1ae2163da6b44b9a73d67e406afe41682a230ecf0bb330a",
    },
    seedIndex: "3",
    rootCapoScriptHash: {
        bytes: "e3c11d02c3124bfd64f75b5338754056b7ed408bd4372e41c2502966",
    },
};

import { NextPageContext } from "next";
import { NextRouter, withRouter } from "next/router.js";
import head from "next/head.js";
const Head = head.default;
import link from "next/link.js";
const Link = link.default;

import { useRouter } from "next/router.js";
import React, { MouseEventHandler, use, useEffect, useState } from "react";
import { Prose } from "@/components/Prose.jsx";
import { useLiveQuery } from "dexie-react-hooks";
import {
    Address,
    ConfigFor,
    StellarConstructorArgs,
    StellarTxnContext,
    TxInput,
    WalletHelper,
    dumpAny,
    helios,
} from "@donecollectively/stellar-contracts";
import {
    CMDBCapo,
    BookEntryForUpdate as BookEntryForUpdate,
    BookEntryOnchain,
} from "../../contracts/CMDBCapo.js";
import { PageEditor } from "../../local-comps/book/PageEditor.jsx";
import { BookPages } from "../../local-comps/book/BookPages.jsx";
import { PageView } from "../../local-comps/book/PageView.js";
import { Button } from "../../components/Button.js";
import { ClientSideOnly } from "../../components/ClientSideOnly.js";
import { inPortal } from "../../inPortal.js";
import { Progress } from "../../components/Progress.js";
import { Invitation } from "../../local-comps/book/Invitation.jsx";

// Helios types
const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hBlockfrost = typeof BlockfrostV0.prototype;
type hTxChain = typeof TxChain.prototype;
type hWallet = typeof Cip30Wallet.prototype;

type paramsType = {
    router: NextRouter;
};
type NetParams = Awaited<ReturnType<hBlockfrost["getParameters"]>>;

export type PageStatus = {
    status?: string;
    error?: true;
    progressBar?: true | string;
};

type stateType = PageStatus & {
    bookContract?: CMDBCapo;
    networkParams?: NetParams;
    progResult?: string;
    selectedWallet?: string;
    wallet?: hWallet;
    walletHelper?: WalletHelper;
    walletUtxos?: TxInput[];
    networkName?: string;
    roles?: string[];
    connectingWallet?: boolean;
    showDetail?: string;
    tcx?: StellarTxnContext<any>;

    bookDetails?: BookEntryForUpdate[];
    bookEntryIndex?: { [k: string]: BookEntryForUpdate };

    nextAction?: keyof typeof actionLabels;
    moreInstructions?: string;
    actionLabel?: string;
};

const actionLabels = {
    initializeBookContract: "Create a Book",
    retryCreation: "Retry",
};

const networkNames = {
    0: "preprod",
    1: "mainnet",
};

let mountCount = 0;

// TODO:
//   _x_   1.  change Stellar {signers} to be a list of addresses, not Wallets
//   _x_   2.  avoid using Wallet's selected collateral utxo implicitly during findUtxo
//   _x_   3.  finish contract init
//   _x_   4.  show init results for deployment
//   _x_   5. create form
//   _x_   6.  do first registration
//   _x_   7.  do second registration
//   _x_   8.  update a registration
//   _x_   9.  implement registration timeout
//   _x_ 10. implement validations on listings

//   _x_   ?.  add actor collateral to TCX, on-demand and/or during addScript (when??)

export class BookHomePage extends React.Component<paramsType, stateType> {
    bf: hBlockfrost;
    bfFast: hTxChain;
    static notProse = true;
    i: number;
    constructor(props) {
        super(props);
        this.i = mountCount += 1;
        this.updateState = this.updateState.bind(this);
        this.reportError = this.reportError.bind(this);
        this.goToInvite = this.goToInvite.bind(this);
        this.createBookEntry = this.createBookEntry.bind(this);
        this.fetchBookEntries = this.fetchBookEntries.bind(this);
        this.closeForm = this.closeForm.bind(this);
        this.connectWallet = this.connectWallet.bind(this);
        this.state = { status: "connecting to blockfrost" };

        this.bf = new BlockfrostV0(
            "preprod",
            "preprodCwAM4ABR6SowGsmURORvDJvQTyWmCHJP"
        );
        this.bfFast = new TxChain(this.bf);
    }

    get router() {
        return this.props.router;
    }

    async createBookEntry() {
        const { wallet } = this.state;
        if (!wallet) {
            await this.connectWallet(false);
        }

        await this.updateState("", {}, "//triggering creation screen");
        this.router.push(`/book/create`, "", { shallow: true });
        // window.history.pushState("", "", "/book/create")
    }

    closeForm() {
        this.updateState(undefined, {}, "//closing form");
        this.router.back();
    }

    saved(isNew: boolean) {
        this.updateState(
            `Submitted ${isNew ? "new" : "updated"} listing to ${
                this.bf.networkName
            } network`,
            {},
            "//saved!  : )"
        );
    }

    get currentRoute(): [
        "invite" | "list" | "view" | "create" | "edit",
        string | undefined
    ] {
        const { router } = this.props;
        const [arg1, arg2] = router.query.args || [];

        if ("invite" == arg1) {
            return ["invite", undefined];
        }

        if ("create" == arg1) {
            return ["create", undefined];
        }
        if ("edit" == arg2) {
            const id = arg1;
            return ["edit", id];
        }
        if (arg1) {
            return ["view", arg1];
        }
        return ["list", undefined];
    }

    render() {
        let {
            tcx,
            bookContract,
            bookDetails,
            wallet,
            progressBar,
            walletUtxos,
            walletHelper,
            status,
            roles,
            showDetail,
            error,
            nextAction,
            actionLabel: actionMessage,
            moreInstructions,
            progResult,
        } = this.state;

        // console.warn(`-------------------------- RENDER ---------------------------\n ---> ${status}`);
        const { router } = this.props;
        const [arg1, arg2] = router.query.args || [];
        const [route, id] = this.currentRoute;

        let results;
        if (error) {
            results = <div>Fix the problem before continuing.</div>;
        }

        const loading = <Progress key={status}>loading</Progress>;
        const walletInfo = this.renderWalletInfo();
        const showProgressBar = !!progressBar;

        const doNextAction = !!nextAction && (
            <button
                className="btn border rounded float-right"
                style={{
                    float: "right",
                    padding: "0.75em",
                    marginLeft: "0.5em",
                    // marginTop: '-0.75em',
                    border: "1px solid #0000ff",
                    borderRadius: "0.25em",
                    backgroundColor: "#007",
                }}
                onClick={() => this.doAction(nextAction)}
            >
                {actionMessage || actionLabels[nextAction]}
            </button>
        );
        const showMoreInstructions = moreInstructions ? (
            <>
                <br />
                {moreInstructions}
            </>
        ) : null;
        const roleInfo = this.renderRoleInfo();
        const inviteLink = roles?.includes("editor") ? this.inviteButton() : "";
        const topRightContent = inPortal(
            "topRight",
            <>
                {roleInfo} {walletInfo}
                {inviteLink}
            </>
        );

        const progressLabel = "string" == typeof progressBar ? progressBar : "";
        const renderedStatus =
            (status &&
                inPortal(
                    "topLeft",
                    <div className="absolute z-40 opacity-60 top-0">
                        {showProgressBar ? (
                            <Progress>{progressLabel}</Progress>
                        ) : (
                            ""
                        )}
                        {error ? (
                            <div
                                className="error border rounded relative left-0 top-0 mb-4 min-w-screen-md max-w-screen-md sm:max-w-screen-sm"
                                role="alert"
                                style={{ marginBottom: "0.75em" }}
                            >
                                {doNextAction}
                                <strong className="font-bold">
                                    Whoops! &nbsp;&nbsp;
                                </strong>
                                <span key="status-err" className="block inline">{status}</span>

                                {showMoreInstructions}
                            </div>
                        ) : (
                            <div
                                className="status border rounded relative left-0 top-0 mb-4 min-w-screen-md max-w-screen-md sm:max-w-screen-sm"
                                role="banner"
                                // style={{ marginBottom: "-7em" }}
                            >
                                {doNextAction}
                                <span key="status" className="block sm:inline">
                                    {status}
                                </span>

                                {showMoreInstructions}
                            </div>
                        )}
                    </div>
                )) ||
            "";

        if (!bookDetails) {
            results = inPortal("topCenter", loading);
        } else if ("invite" == route) {
            if (wallet) {
                results = (
                    <Invitation
                        {...{
                            updateState: this.updateState,
                            reportError: this.reportError,
                            bookContract: bookContract,
                        }}
                    />
                );
            } else {
                this.connectWallet(false);
            }
        } else if ("create" == route) {
            if (wallet) {
                results = (
                    <PageEditor
                        {...{
                            bookContract,
                            wallet,
                            walletHelper,
                            walletUtxos,
                            updateState: this.updateState,
                            reportError: this.reportError,
                            refresh: this.fetchBookEntries,
                            router,
                        }}
                        create
                        onSave={this.saved}
                        onClose={this.closeForm}
                    />
                );
            } else {
                this.connectWallet(false);
            }
        } else if ("edit" == route) {
            if (wallet) {
                const editing = this.state.bookEntryIndex[id];
                results = (
                    <PageEditor
                        {...{
                            bookContract,
                            wallet,
                            updateState: this.updateState,
                            reportError: this.reportError,
                            refresh: this.fetchBookEntries,
                            router,
                        }}
                        entry={editing}
                        onSave={this.saved}
                        onClose={this.closeForm}
                    />
                );
            } else {
                this.connectWallet(false);
                results = loading;
            }
        } else if ("view" == route) {
            // status = "";
            const entry = this.state.bookEntryIndex[id];
            results = (
                <PageView
                    {...{
                        entry,
                        updateState: this.updateState,
                        reportError: this.reportError,
                        wallet,
                        walletUtxos,
                        bookContract,
                    }}
                />
            );
        } else {
            results = (
                <BookPages
                    {...{
                        bookDetails: bookDetails,
                        createBookEntry: this.createBookEntry,
                        bookContract,
                        bookMgrStatus: status,
                        ...(roles?.includes("collaborator")
                            ? { isCollaborator: true }
                            : {}),
                    }}
                />
            );
        }

        const detail = showDetail ? (
            <Prose className={``}>
                DETAILS
                <pre>{showDetail}</pre>
            </Prose>
        ) : (
            ""
        );
        return (
            <div>
                <Head>
                    <title>‹proj title here?›- Cardano MDBook</title>
                </Head>
                {renderedStatus}
                {topRightContent}
                {detail}
                {results}
                {this.txnDump()}
                {progResult}
                {/* <Prose className="">
                    <div className="suppressHydrationWarning"> instance {this.i} </div>
                </Prose> */}
            </div>
        );
    }

    inviteButton() {
        return (
            <Button
                variant="secondary-sm"
                className="ml-2"
                onClick={this.goToInvite}
            >
                Invite Collaborators
            </Button>
        );
    }

    goToInvite() {
        this.props.router.push("/book/invite");
    }

    renderRoleInfo() {
        const { roles } = this.state;
        if (!roles) return;

        return (
            <>
                {roles.map((r) => {
                    return (
                        <span key={`role-${r}`} className="ml-1 inline-block mb-0 rounded border border-slate-500 text-slate-400 text-sm px-2 py-0 bg-emerald-800 shadow-none outline-none transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:cursor-text">
                            {r}
                        </span>
                    );
                })}
            </>
        );
    }

    doAction(action) {
        const actions = {
            initializeBookContract: this.bootstrapBookContract,
            retryCreation: this.connectBookContract,
        };
        const thisAction = actions[action];
        thisAction.call(this);
    }

    renderWalletInfo() {
        const { wallet, networkName, connectingWallet } = this.state;

        if (wallet) {
            return (
                <span key="chip-networkName" className="inline-block mb-0 rounded border border-slate-500 text-slate-400 text-sm px-2 py-0 bg-blue-900 shadow-none outline-none transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:cursor-text">
                    {networkName}
                </span>
            );
        } else if (connectingWallet) {
            return (
                <div>
                    <Button variant="secondary" disabled className="-mt-3">
                        ... connecting ...
                    </Button>
                </div>
            );
        } else {
            return (
                <div>
                    <Button
                        variant="secondary"
                        className="-mt-3"
                        onClick={this.onConnectButton}
                    >
                        Connect Wallet
                    </Button>
                </div>
            );
        }
    }

    onConnectButton: MouseEventHandler<HTMLButtonElement> = async (event) => {
        this.connectWallet();
    };

    txnDump() {
        const { tcx } = this.state;
        if (!tcx) return;

        const txnDump = tcx && dumpAny(tcx);
        {
            txnDump && (
                <pre
                    style={{
                        color: "#999",
                        border: "1px dashed #505",
                        borderRadius: "0.5em",
                    }}
                >
                    {txnDump}

                    {tcx.state.bsc &&
                        JSON.stringify(tcx.state.bootstrappedConfig, null, 2)}
                </pre>
            );
        }
    }

    //  ---- Component setup sequence starts here
    //  -- step 1: get blockfrost's network params
    async componentDidMount() {
        const networkParams: NetParams = await this.bf.getParameters();
        console.log("ok: got blockfrost network params");

        if ("undefined" != typeof window) {
            if (window.localStorage.getItem("autoConnect")) {
                await this.connectWallet();
            }
        }

        // await this.updateState('connecting to wallet', {
        await this.updateState(
            "initializing registry",
            {
                networkParams,
            },
            "//component did mount"
        );
        this.connectBookContract();
    }

    _unmounted?: true;
    async componentWillUnmount() {
        this._unmounted = true;
        console.error("CCR list unmounted"); // not really an error
        // debugger
    }

    newWalletSelected(selectedWallet: string = "eternl") {
        this.setState({ selectedWallet }, this.connectWallet.bind(this));
    }

    //  -- step 2: connect to Cardano wallet
    connectingWallet: Promise<any>;
    async connectWallet(autoNext = true) {
        const { selectedWallet = "eternl", wallet:alreadyConnected,  bookContract} = this.state;
        if (alreadyConnected) return true;

        //! it suppresses lame nextjs/react-sourced double-trigger of mount sequence
        // if (this._unmounted) return
        // debugger
        if (this.connectingWallet) {
            console.warn(
                "suppressing redundant wallet connect, already pending"
            );

            return this.connectingWallet;
        }

        await this.updateState(
            "connecting to Cardano wallet",
            {
                connectingWallet: true,
                progressBar: true,
            },
            "//connecting wallet"
        );
        const connecting = (this.connectingWallet =
            //@ts-expect-error on Cardano
            window.cardano[selectedWallet].enable());
        const handle: helios.Cip30Handle = await connecting;

        const networkName = networkNames[await handle.getNetworkId()];
        if (networkName !== "preprod") {
            return this.updateState(
                `This application is only released on the preprod testnet for now.  Please switch to a preprod wallet.`,
                { error: true },
                "//wallet not on preprod"
            );
        }
        if (this.bf.networkName !== networkName) {
            //! checks that wallet network matches network params / bf
            this.updateState(
                `wallet network mismatch; expected ${this.bf.networkName}, wallet ${networkName}`,
                { error: true },
                "//wallet network doesn't match bf network"
            );
            return;
        }
        const wallet = new helios.Cip30Wallet(handle);

        const collateralUtxos = await handle.getCollateral();
        if (!collateralUtxos?.length) {
            this.updateState(
                `Error: no collateral UTxO set in wallet config`,
                {
                    error: true,
                },
                "//no collateral"
            );
            return;
        }

        const walletHelper = new helios.WalletHelper(wallet);

        walletHelper.getUtxos().then((walletUtxos) => {
            this.updateState(
                undefined,
                { walletUtxos },
                "//found wallet utxos"
            );
        });
        const newState = {
            wallet,
            connectingWallet: false,
            walletHelper,
            networkName,
        };
        if (bookContract) {
            await this.updateState(
                "reinitializing registry with wallet connected",
                newState,
                "//reinit after wallet"
            );
            return this.connectBookContract(autoNext).then(async () => {
                debugger;
                if (this.state?.bookContract?.configIn) {
                    await this.checkWalletTokens(wallet);
                }
            });
        } else {
            return this.updateState("", newState, "//wallet connected; no existing bookContract: not reinitializing")
        }
    }

    async checkWalletTokens(wallet: helios.Cip30Wallet) {
        const { bookContract } = this.state;
        if (!bookContract) {
            await this.updateState(
                "no bookContract yet",
                {},
                "/// no book contract, skipping scan for authority tokens"
            );
            return;
        }

        await this.updateState(
            "checking wallet for authority tokens ",
            {},
            "/// looking for authority tokens  from policy " +
                bookContract.mph.hex
        );

        const roles = [];
        const isCollab = await bookContract.findRoleUtxo("collab");
        const isEditor = await bookContract.findRoleUtxo("capoGov");

        if (!!isCollab) {
            roles.push("collaborator");
            if ("undefined" !== typeof window) {
                if (!window.localStorage.getItem("autoConnect")) {
                    window.localStorage.setItem("autoConnect", "1")
                }
            }
        }
        if (!!isEditor) roles.push("editor");

        const message = roles.includes("collaborator")
            ? ""
            : `To be a collaborator on this CMDBook, please send your wallet address to the book editor,` +
              `or connect a wallet having a collab-* token from policyId ${bookContract.mph.hex}`;

        this.updateState(message, { roles }, `/// found ${roles.length} roles: ${roles.join(", ")}}`);
    }

    // -- step 3 - check if the book contract is ready for use
    async connectBookContract(autoNext = true, reset?: "reset") {
        const [route] = this.currentRoute;
        if ("create" == route || "edit" == route) {
            await this.connectWallet();
        }
        const { networkParams, wallet } = this.state;
        let config =
            !reset && CMDB_BookContractConfig
                ? { config: CMDBCapo.parseConfig(CMDB_BookContractConfig) }
                : { partialConfig: {} };

        if (!wallet) console.warn("connecting to registry with no wallet");
        let cfg: StellarConstructorArgs<ConfigFor<CMDBCapo>> = {
            setup: {
                network: this.bfFast,
                networkParams,
                myActor: wallet,
                isDev: "development" == process.env.NODE_ENV,
                optimize: false,
            },
            // partialConfig: {},
            ...config,
        };
        try {
            const bookContract = new CMDBCapo(cfg);
            const isConfigured = await bookContract.isConfigured;
            if (!isConfigured) {
                const message = autoNext
                    ? `Creds Registry contract isn't yet created or configured.  Add a configuration if you have it, or create the registry now.`
                    : "";

                await this.updateState(
                    message,
                    {
                        bookContract,
                        nextAction: "initializeBookContract",
                    },
                    "//bootstrap needed"
                );
                return;
                // return this.stellarSetup();
            }
            if (!autoNext)
                return this.updateState(
                    "",
                    { bookContract },
                    "// book manager is connected to wallet, ready to do an on-chain activity"
                );

            await this.updateState(
                "... searching ...",
                {
                    bookContract,
                },
                "//searching (or freshening search after wallet connection)"
            );

            this.fetchBookEntries();
        } catch (error) {
            this.reportError(error, "checking registry configuration: ", {
                nextAction: "initializeBookContract",
                actionLabel: "Create New Book",
            });
        }
    }

    //  -- step 3a - initialize the registry if needed
    async bootstrapBookContract() {
        if (!this.state.wallet) await this.connectWallet();

        await this.connectBookContract(false, "reset");
        const { bookContract, wallet } = this.state;

        await this.updateState(
            "creating the MDBook charter transaction ...",
            {
                progressBar: true,
            },
            "//creating charter txn"
        );

        let tcx: Awaited<
            ReturnType<stateType["bookContract"]["mkTxnMintCharterToken"]>
        >;
        try {
            const addresses = await wallet.usedAddresses;

            tcx = await bookContract.mkTxnMintCharterToken({
                govAuthorityLink: {
                    strategyName: "address",
                    config: {
                        addrHint: addresses,
                    },
                },
                // mintDelegateLink: {
                //     strategyName: "default"
                // }
            });
        } catch (e) {
            console.error(e);
            this.reportError(e, "creating charter: ", {
                nextAction: "retryCreation",
            });
            debugger;
            return;
        }
        await this.updateState(
            "Bootstrap transaction loading into your wallet...",
            {
                tcx,
                progressBar: true,
                moreInstructions:
                    "If it looks right, sign the transaction to finish initializing the registry.",
            },
            "//push bootstrap txn to wallet"
        );
        try {
            await bookContract.submit(tcx);
            await this.updateState(
                `Book contract creation submitted.  Deploy the following details...`,
                {
                    showDetail: JSON.stringify(
                        tcx.state.bootstrappedConfig,
                        null,
                        2
                    ),
                },
                "//ok: charter txn submitted to network"
            );
            console.warn(
                "------------------- Boostrapped Config -----------------------\n",
                tcx.state.bootstrappedConfig,
                "\n------------------- deploy this! -----------------------\n"
            );

            // this.seekConfirmation()
        } catch (e) {
            console.error(e);
            this.updateState(
                `wallet reported "${e.message}"`,
                {
                    bookContract: undefined,
                    error: true,
                    nextAction: "retryCreation",
                },
                "//wallet error during charter"
            );
        }
    }

    reportError(e: Error, prefix: string, addlAttrs: Partial<stateType>) {
        console.error(e.stack || e.message);
        debugger;
        return this.updateState(
            `${prefix} "${e.message}"`,
            {
                error: true,
                ...addlAttrs,
            },
            "//error msg to user"
        );
    }

    //  -- step 4: Read registry entries from chain
    async fetchBookEntries() {
        const { bookContract } = this.state;

        const found = await this.bf.getUtxos(bookContract.address);
        const { mph } = bookContract;

        const bookDetails: BookEntryForUpdate[] = [];
        const bookEntryIndex = {};
        const waiting: Promise<any>[] = [];
        for (const utxo of found) {
            waiting.push(
                bookContract.readBookEntry(utxo).then((entry) => {
                    if (!entry) return;
                    bookDetails.push(entry);
                    bookEntryIndex[entry.id] = entry;
                })
            );
        }
        await Promise.all(waiting);
        this.updateState(
            "",
            { bookDetails, bookEntryIndex },
            "// finished reading book entries"
        );
    }

    /**
     * Promise-based wrapper for setState, with status message implicit
     * @remarks
     *
     * sets the status message in state.status, along with any other state props
     *
     * automatically clears nextAction, error, and actionLabels if they aren't
     * explicitly set.
     *
     * returns an await-able promise for setting the indicated state
     *
     * @public
     **/
    updateState(
        status: string | undefined,
        stateProps: Omit<stateType, "status"> = {},
        extraComment: string
    ): Promise<any> {
        const {
            nextAction = undefined,
            moreInstructions = undefined,
            progressBar = undefined,
            error = undefined,
            actionLabel = undefined,
        } = stateProps;

        // if (this._unmounted) {
        //     console.warn(`suppressing state update after unmount (\"${status}\")`)
        //     return
        // }
        console.log(`instance ${this.i}`, { status });
        const stateUpdate =
            "undefined" === typeof status
                ? {}
                : {
                      status,
                      nextAction,
                      error,
                      actionLabel,
                      moreInstructions,
                      progressBar,
                  };
        const newState = {
            ...stateProps,
            ...stateUpdate,
        };
        const doneWith =
            ("" == status &&
                this.state.status &&
                `(done: ${this.state.status})`) ||
            "";

        console.error(new Date(), extraComment || "" + doneWith || "", {
            newState,
        });
        return new Promise<void>((resolve) => {
            this.setState(newState, resolve);
        });
    }
    static nextPrev = false;
}
const bookHomePageWithRouter = withRouter(BookHomePage);
//@ts-expect-error
bookHomePageWithRouter.nextPrev = false;
export default bookHomePageWithRouter;
