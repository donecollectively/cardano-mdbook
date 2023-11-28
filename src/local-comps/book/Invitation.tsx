import React, { MouseEventHandler } from "react";
import { BookEntryForUpdate } from "../../contracts/CMDBCapo.js";
import { BookManagementProps } from "./sharedPropTypes.js";
import { Button } from "../../components/Button.jsx";
import { helios, Address as AddressType } from "@donecollectively/stellar-contracts";

type propsType = BookManagementProps;

type stateType = {
    addrString: string;
    address? : AddressType,
    error?: string;
    goodAddress?: boolean;
};

export class Invitation extends React.Component<propsType, stateType> {
    constructor(props) {
        super(props);

        this.getAddr = this.getAddr.bind(this);
    }
    render() {
        const { addrString: addr, error, address } = this.state || {};

        return (
            <div>
                <h2>Collaborator Invitation</h2>

                <label htmlFor="invite-addr" className="font-bold mb-3">
                    Wallet address of Collaborator
                </label>
                <br />
                <input
                    className="bg-blue-950 text-xs focus:bg-blue-900 w-full mt-2 p-3"
                    autoComplete="off"
                    placeholder="paste wallet address"
                    id="invite-addr"
                    name="address"
                    onChange={this.getAddr}
                />
                <br />
                <br />
                <Button
                    className="float-right"
                    disabled={!address}
                    onClick={this.mintCollaboratorToken}
                    variant="primary"
                >
                    Mint collaborator token
                </Button>
                <div className="float-left -mt-[0.1em] min-h-[2em] min-w-[0.33in]">{!!address && "✅" } &nbsp;</div>
                {address || !addr ? (
                    <div className="italic text-sm text-slate-500">
                        The minted token will be sent directly to the
                        collaborator address <br/> after the txn is signed
                    </div>
                ) : (
                    <div className="text-italic text-sm text-rose-500">
                        Address is not valid: {error}
                    </div>
                )}
            </div>
        );
    }

    getAddr(e) {
        const addr = e.target.value;
        const newState: Partial<stateType> = { addrString: addr };
        debugger
        try {
            const address : AddressType = new helios.Address(addr);
            newState.address = address;
            newState.error = "";
        } catch (e) {
            newState.address = undefined;

            newState.error = e.message;
        }
        this.setState(newState as stateType)
    }

     mintCollaboratorToken: MouseEventHandler<HTMLButtonElement> = async () => {
        const { bookContract } = this.props;
        const {address} = this.state;

        const tcx = await bookContract.mkTxnMintCollaboratorToken(address);
        await bookContract.submit(tcx)
    };
}
