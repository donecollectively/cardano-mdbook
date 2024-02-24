import { TxInput, UutName, WalletHelper, helios } from "@donecollectively/stellar-contracts";
import { CMDBCapo } from "../../contracts/CMDBCapo.js"
import { BookHomePage } from "../../pages/book/[...args].jsx";
import type { BookPageState } from "../../pages/book/[...args].jsx";
import { NextRouter } from "next/router.js";

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hBlockfrost = typeof BlockfrostV0.prototype;
type hTxChain = typeof TxChain.prototype;
type hWallet = typeof Cip30Wallet.prototype;

type stateUpdaterFunc = BookHomePage["updateState"];
type errorFunc = BookHomePage["reportError"];

export type BookManagementProps = {
    bookMgrDetails: {
        bookContract: CMDBCapo;
        router: NextRouter;
        roles: BookPageState["roles"] | undefined;
        collabUut : UutName | undefined;
        updateState: stateUpdaterFunc;
        reportError: errorFunc;
        pageViewUrl: Function;
        goViewPage: Function;
        goEditPage: Function;
        wallet? : hWallet;
        connectingWallet: boolean;
        walletUtxos? : TxInput[],
        walletHelper? : WalletHelper
    }
}