import { TxInput, WalletHelper, helios } from "@donecollectively/stellar-contracts";
import { CMDBCapo } from "../../contracts/CMDBCapo.js"

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hBlockfrost = typeof BlockfrostV0.prototype;
type hTxChain = typeof TxChain.prototype;
type hWallet = typeof Cip30Wallet.prototype;

export type BookManagementProps = {
    bookContract: CMDBCapo;
    wallet? : hWallet;
    walletUtxos? : TxInput[],
    walletHelper? : WalletHelper
}