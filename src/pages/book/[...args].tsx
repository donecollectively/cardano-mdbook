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
    mph: { bytes: "1caa8526c25066237f4d1e5e271790fa7de0bc286c1b39ccac076f92" },
    rev: "1",
    isDev: true,
    devGen: "8",
    seedTxn: {
        bytes: "ebea3b3fe691b71fa254682e9232ab14540ea694c13945ac41d32c6487c1e21e",
    },
    seedIndex: "5",
    rootCapoScriptHash: {
        bytes: "d3b181cdf036c70178ae4763a0a50f2f829cf8a50abdc59c41958d17",
    },
};

import type { NextRouter } from "next/router.js";
import { withRouter } from "next/router.js";
import head from "next/head.js";
const Head = head.default;
import link from "next/link.js";
const Link = link.default;

import { useRouter } from "next/router.js";
import React from "react";
import type { MouseEventHandler } from "react";
import { Prose } from "../../components/Prose.jsx";
import { useLiveQuery } from "dexie-react-hooks";

import type {
    ConfigFor,
    StellarFactoryArgs,
} from "@donecollectively/stellar-contracts";

import {
    StellarTxnContext,
    TxInput,
    UutName,
    ValidatorHash,
    WalletHelper,
    dumpAny,
    helios,
} from "@donecollectively/stellar-contracts";

import type {
    BookEntryForUpdate,
    BookIndex,
} from "../../contracts/CMDBCapo.js";
import { CMDBCapo } from "../../contracts/CMDBCapo.js";
import { PageEditor } from "../../local-comps/book/PageEditor.jsx";
import { BookPages } from "../../local-comps/book/BookPages.jsx";
import { PageView } from "../../local-comps/book/PageView.js";
import { Button } from "../../components/Button.js";
import { ClientSideOnly } from "../../components/ClientSideOnly.js";
import { inPortal } from "../../inPortal.js";
import { Progress } from "../../components/Progress.js";
import { Invitation } from "../../local-comps/book/Invitation.jsx";
import { hasBookMgr } from "../../local-comps/book/sharedPropTypes.js";

// Helios types
const { BlockfrostV0, Cip30Wallet, TxChain, NetworkParams } = helios;
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

class NetworkParamsWithFeeOverride extends NetworkParams {
    static withFeeOverride(params: NetParams): NetworkParamsWithFeeOverride {
        // return new NetworkParams(params.raw)
        // create an object wrapping params, with a getter for exFeeParams
        return new NetworkParamsWithFeeOverride(params);
    }
    constructor(params: NetParams) {
        super(params.raw);
        const that: NetParams = this;
        return new Proxy(params, {
            get(target: NetParams, prop, receiver) {
                if (prop == "exFeeParams") {
                    const {
                        exFeeParams: [mem, cpu],
                    } = target;

                    return [mem * 2.5, cpu * 2.5];
                }
                if (typeof params[prop] == "function") {
                    return params[prop].bind(params);
                }
                return Reflect.get(params, prop, params);
            },
        });
    }
}

export type BookPageState = PageStatus & {
    bookContract?: CMDBCapo;
    networkParams?: NetParams;
    progResult?: string;
    selectedWallet?: string;
    wallet?: hWallet;
    walletHelper?: WalletHelper;
    walletUtxos?: TxInput[];
    networkName?: string;
    roles?: ("collaborator" | "editor")[];
    collabUut?: UutName;
    connectingWallet?: boolean;
    showDetail?: string;
    tcx?: StellarTxnContext<any>;

    bookDetails?: BookEntryForUpdate[];
    bookEntryIndex?: BookIndex;

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

type moreStatusOptions = {
    clearAfter?: number;
};

const bfKeys = {
    mainnet: "mainnetvtlJdtsOo7nNwf58Az9F5HRDGCIkxujZ",
    preprod: "preprodCwAM4ABR6SowGsmURORvDJvQTyWmCHJP",
};

type UpdateStateProps = Omit<BookPageState, "status"> & moreStatusOptions;

export class BookHomePage extends React.Component<paramsType, BookPageState> {
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
        this.pageViewUrl = this.pageViewUrl.bind(this);
        this.goViewPage = this.goViewPage.bind(this);
        this.goEditPage = this.goEditPage.bind(this);
        this.goCreatePage = this.goCreatePage.bind(this);
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

    async goCreatePage() {
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
        if ("v" == arg1) {
            return ["view", arg2];
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
            connectingWallet,
            walletHelper,
            status,
            roles,
            collabUut: collabUut,
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
                                <span key="status-err" className="block inline">
                                    {status}
                                </span>

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
                results = <Invitation {...this.mkBookManagementProps()} />;
            } else {
                this.connectWallet(false);
            }
        } else if ("create" == route) {
            if (wallet) {
                results = (
                    <PageEditor
                        {...{
                            ...this.mkBookManagementProps(),
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
                            ...this.mkBookManagementProps(),
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
            const [id, changeId] = arg2.split("+");
            const entry = this.state.bookEntryIndex[id];
            const change = entry.pendingChanges.find(
                (x) => x.change.id == changeId
            );
            // type XXXXXX = typeof entry.pageEntry
            results = (
                <PageView
                    {...{
                        ...this.mkBookManagementProps(),
                        entry,
                        change,
                    }}
                />
            );
        } else {
            results = (
                <BookPages
                    {...{
                        bookDetails: bookDetails,
                        index: this.state.bookEntryIndex,
                        createBookEntry: this.goCreatePage,
                        bookMgrStatus: status,
                        ...this.mkBookManagementProps(),
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
        const title = process.env.NEXT_PUBLIC_CMDBook
            ? "dev"
            : "‹proj title here?›";
        const addrInfo =
            "development" == process.env.NODE_ENV && bookContract
                ? bookContract.address.toBech32()
                : "";
        return (
            <div>
                <Head>
                    <title>{`${title} - Cardano MDBook`}</title>
                </Head>
                {renderedStatus}
                {topRightContent}
                {detail}
                {results}
                {this.txnDump()}
                {progResult}
                {addrInfo ? "address: " + addrInfo : ""}
                {/* <Prose className="">
                    <div className="suppressHydrationWarning"> instance {this.i} </div>
                </Prose> */}
            </div>
        );
    }

    mkBookManagementProps(): hasBookMgr {
        const {
            bookContract,
            roles,
            collabUut,
            wallet,
            connectingWallet,
            walletUtxos,
            walletHelper,
        } = this.state;

        return {
            mgr: {
                bookContract,
                roles,
                collabUut,
                updateState: this.updateState,
                reportError: this.reportError,
                goViewPage: this.goViewPage,
                pageViewUrl: this.pageViewUrl,
                goEditPage: this.goEditPage,
                wallet,
                connectingWallet,
                walletUtxos,
                walletHelper,
                router: this.props.router,
            },
        };
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
        this.props.router.push("/book/invite", "", { shallow: true });
    }

    goViewPage(id: string, change?: string) {
        this.props.router.push(this.pageViewUrl(id, change), "", {
            shallow: true,
        });
    }

    pageViewUrl(id: string, change?: string) {
        const frag = change ? `${id}+${change}` : id;
        const be = this.state.bookEntryIndex[id];
        const title = be.pageEntry.entry.title;
        // convert characters in title to be SEO friendly:
        const seoFriendlyTitle = title
            .toLowerCase()
            .replace(/[^a-zA-Z0-9]/g, "-") // replace any non-alphanumeric characters with hyphens
            .replace(/-+/g, "-") // replace any multiple hyphens with a single hyphen
            .replace(/^-|-$/g, "") // remove any hyphens at the start or end of the string
            .replace(/\//g, "-"); // replace any slashes with hyphens
        return `/book/v/${frag}/${seoFriendlyTitle}`;
    }

    goEditPage(id: string) {
        this.props.router.push(`/book/${id}/edit`, "", { shallow: true });
    }

    renderRoleInfo() {
        const { roles } = this.state;
        if (!roles) return;

        return (
            <>
                {roles.map((r) => {
                    return (
                        <span
                            key={`role-${r}`}
                            className="ml-1 inline-block mb-0 rounded border border-slate-500 text-slate-400 text-sm px-2 py-0 bg-emerald-800 shadow-none outline-none transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:cursor-text"
                        >
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
                <span
                    key="chip-networkName"
                    className="inline-block mb-0 rounded border border-slate-500 text-slate-400 text-sm px-2 py-0 bg-blue-900 shadow-none outline-none transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:cursor-text"
                >
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

        const txnDump =
            tcx && dumpAny(tcx, this.state.bookContract?.networkParams);
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
        const networkParams: NetParams =
            NetworkParamsWithFeeOverride.withFeeOverride(
                await this.bf.getParameters()
            );

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
        console.error("cMDBook unmounted"); // not really an error
    }

    newWalletSelected(selectedWallet: string = "eternl") {
        this.setState({ selectedWallet }, this.connectWallet.bind(this));
    }

    //  -- step 2: connect to Cardano wallet
    walletConnectPromise: Promise<any>;
    async connectWallet(autoNext = true) {
        const {
            selectedWallet = "eternl",
            wallet: alreadyConnected,
            bookContract,
        } = this.state;
        if (alreadyConnected) return true;

        //! it suppresses lame nextjs/react-sourced double-trigger of mount sequence
        // if (this._unmounted) return
        // debugger
        if (this.walletConnectPromise) {
            console.warn(
                "suppressing redundant wallet connect, already pending"
            );

            return this.walletConnectPromise;
        }

        await this.updateState(
            "connecting to Cardano wallet",
            {
                connectingWallet: true,
                progressBar: true,
            },
            "//connecting wallet"
        );
        const connecting = (this.walletConnectPromise =
            //@ts-expect-error on Cardano
            window.cardano[selectedWallet].enable());
        const handle: helios.Cip30Handle = await connecting.catch((e) => {
            this.walletConnectPromise = undefined;
            this.reportError(e, "wallet connect", {});
        });
        if (!handle) return;

        console.warn("CIP-30 Wallet Handle", handle);

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
        const walletHelper = new helios.WalletHelper(wallet);

        const newState = {
            wallet,
            connectingWallet: false,
            walletHelper,
            networkName,
        };
        await this.updateState(
            "",
            newState,
            "//wallet connected; no existing bookContract: not reinitializing"
        );

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

        walletHelper.getUtxos().then((walletUtxos) => {
            this.updateState(
                undefined,
                { walletUtxos },
                "//found wallet utxos"
            );
        });
        if (this.state.bookContract && !this.state.bookContract.isConnected) {
            await this.updateState(
                "reinitializing registry with wallet connected",
                {},
                "//reinit after wallet"
            );
            return this.connectBookContract(autoNext);
        }
    }

    async checkWalletTokens(wallet: helios.Cip30Wallet) {
        const { bookContract } = this.state;
        if (!bookContract?.myActor) {
            debugger;
            await this.updateState(
                "no bookContract yet, or not connected to wallet",
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
        const collabUtxo = await bookContract.findUserRoleUtxo("collab");
        const isEditor = await bookContract.findUserRoleUtxo("capoGov");

        let collabToken;
        if (!!collabUtxo) {
            collabToken = bookContract.mkUutName("collab", collabUtxo);

            roles.push("collaborator");
            if ("undefined" !== typeof window) {
                if (!window.localStorage.getItem("autoConnect")) {
                    window.localStorage.setItem("autoConnect", "1");
                }
            }
        }
        if (!!isEditor) roles.push("editor");

        const message = roles.includes("collaborator")
            ? ""
            : `To be a collaborator on this CMDBook, please send your wallet address to the book editor,` +
              `or connect a wallet having a collab-* token from policyId ${bookContract.mph.hex}`;

        this.updateState(
            message,
            { roles, collabUut: collabToken },
            `/// found ${roles.length} roles: ${roles.join(", ")}}`
        );
    }

    // -- step 3 - check if the book contract is ready for use
    async connectBookContract(autoNext = true, reset?: "reset") {
        // const priorVH = "b30c39d09103f5ed3588adc9179cb957137ffa79568e6a5dfda4e317"
        // const addr = helios.Address.fromHashes(new helios.ValidatorHash(priorVH))
        // window.alert(addr.toBech32())

        const [route] = this.currentRoute;
        if ("create" == route || "edit" == route) {
            await this.connectWallet();
        }
        const { networkParams, wallet } = this.state;
        let localConfig = window.localStorage.getItem("cmdbConfig");
        if (localConfig)
            try {
                localConfig = JSON.parse(localConfig);

                debugger;
                this.updateState(
                    "using dev-time config from localStorage to load contract ...",
                    {
                        clearAfter: 5000,
                    },
                    "// dev-time notice"
                );
            } catch (e) {
                return this.reportError(e, "parsing devCfg from localStorage", {
                    actionLabel: "reset devCfg",
                    nextAction: "initializeBookContract",
                });
            }
        const bestKnownConfig = localConfig || CMDB_BookContractConfig;
        let config =
            !reset && bestKnownConfig
                ? { config: CMDBCapo.parseConfig(bestKnownConfig) }
                : { partialConfig: {} };

        if (!wallet) console.warn("connecting to registry with no wallet");
        let cfg: StellarFactoryArgs<ConfigFor<CMDBCapo>> = {
            setup: {
                network: this.bfFast,
                networkParams,
                myActor: wallet,
                isDev: true // "development" == process.env.NODE_ENV,
                // optimize: true,
            },
            // partialConfig: {},
            ...config,
        };
        try {
            console.log("init with cfg", cfg);
            
            const bookContract = await CMDBCapo.createWith(cfg);
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
            this.checkWalletTokens(wallet);
            this.fetchBookEntries();
        } catch (error) {
            this.reportError(error, "checking registry configuration", {
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
            ReturnType<BookPageState["bookContract"]["mkTxnMintCharterToken"]>
        >;
        try {
            const addresses = await wallet.usedAddresses;
            // type Expand<T> =  T extends infer O ? { [K in keyof O]: O[K] } : never;
            // type tt = Expand<typeof t.state>
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
            this.reportError(e, "creating charter", {
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
            console.warn(
                "------------------- Boostrapped Config -----------------------\n",
                tcx.state.bootstrappedConfig,
                "\n------------------- deploy this! -----------------------\n"
            );

            if ("development" == process.env.NODE_ENV) {
                window.localStorage.setItem(
                    "cmdbConfig",
                    JSON.stringify(tcx.state.bootstrappedConfig)
                );
                await this.updateState(
                    "Okay: self-deployed dev-time config.  It might take 10-20s for the charter to be found on-chain",
                    {
                        clearAfter: 5000,
                        moreInstructions:
                            "Next: will create 3x onchain reference scripts",
                    },
                    "//stored bootstrapped config in localStorage"
                );
                await new Promise((res) => setTimeout(res, 5000));
            }

            let i = 1;
            const n = [...Object.keys(tcx.state.addlTxns)].length;
            await bookContract.submitAddlTxns(tcx, async (addlTxn) => {
                await this.updateState(
                    `(${i++} of ${n}): loading txn to wallet: ${
                        addlTxn.description
                    }`,
                    {
                        tcx: addlTxn.tcx,
                        progressBar: true,
                        moreInstructions: addlTxn.moreInfo,
                    },
                    `///push ${addlTxn.description} txn to wallet`
                );
            });
            if ("development" == process.env.NODE_ENV) {
                return this.updateState(
                    `Dev-time config and refScripts submitted.  The refScripts will be found on-chain in 10-20 seconds.`,
                    {
                        clearAfter: 5000,
                    },
                    "/// acknowledge dev-time config and refScripts submitted"
                );
            }

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

    reportError(e: Error, prefix: string, addlAttrs: UpdateStateProps) {
        console.error(e.stack || e.message);
        debugger;
        return this.updateState(
            `${prefix}: "${e.message}"`,
            {
                error: true,
                ...addlAttrs,
            },
            "//error msg to user"
        );
    }

    // const allInstances = await instanceRegistry.findInstances(this.bf)
    // const instanceIndex = instanceRegistry.mkInstanceIndex(allInstances);

    // this.updateState("", {
    //     allInstances,
    //     instanceIndex,
    // });

    //  -- step 4: Read registry entries from chain
    async fetchBookEntries() {
        const { bookContract } = this.state;

        const bookDetails = await bookContract.findBookEntries();
        const bookEntryIndex = await bookContract.indexBookEntries(bookDetails);

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
        stateProps: UpdateStateProps = {},
        extraComment: string
    ): Promise<any> {
        const {
            nextAction = undefined,
            moreInstructions = undefined,
            progressBar = undefined,
            error = undefined,
            actionLabel = undefined,
            clearAfter = 0,
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
            if (clearAfter) {
                setTimeout(() => {
                    if (this.state.status == status)
                        this.updateState("", {}, "//clear previous message");
                }, clearAfter);
            }
        });
    }
    static nextPrev = false;
}
const bookHomePageWithRouter = withRouter(BookHomePage);
//@ts-expect-error
bookHomePageWithRouter.wrapped = BookHomePage;
//@ts-expect-error
bookHomePageWithRouter.nextPrev = false;
export default bookHomePageWithRouter;
