import { TxInput, WalletHelper, helios } from "@donecollectively/stellar-contracts";
import { CCRegistry } from "../../contracts/CCRegistry.js"

const { BlockfrostV0, Cip30Wallet, TxChain } = helios;
type hBlockfrost = typeof BlockfrostV0.prototype;
type hTxChain = typeof TxChain.prototype;
type hWallet = typeof Cip30Wallet.prototype;

export type credRegistryProps = {
    credsRegistry: CCRegistry;
    wallet? : hWallet;
    walletUtxos? : TxInput[],
    walletHelper? : WalletHelper
}