import { TxInput, UutName, WalletHelper, helios } from "@donecollectively/stellar-contracts";
import { CMDBCapo } from "../../contracts/CMDBCapo.js"
import { BookHomePage, BookPageState } from "../../pages/book/[...args].jsx";

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hBlockfrost = typeof BlockfrostV0.prototype;
type hTxChain = typeof TxChain.prototype;
type hWallet = typeof Cip30Wallet.prototype;

type stateUpdaterFunc = BookHomePage["updateState"];
type errorFunc = BookHomePage["reportError"];

export type BookManagementProps = {
    bookContract: CMDBCapo;
    roles: BookPageState["roles"] | undefined;
    collabUut : UutName | undefined;
    updateState: stateUpdaterFunc;
    reportError: errorFunc;
    wallet? : hWallet;
    connectingWallet: boolean;
    walletUtxos? : TxInput[],
    walletHelper? : WalletHelper
}