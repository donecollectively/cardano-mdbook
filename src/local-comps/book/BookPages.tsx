import React from "react";
import { CCRegistry, RegisteredCredentialForUpdate, RegisteredCredentialOnchain } from "../../contracts/CCRegistry.js";
import { Prose } from "../Prose.jsx";
import link from "next/link.js"; const Link = link.default;

type paramsType = {
    credsRegistry: CCRegistry;    
    allCreds: RegisteredCredentialForUpdate[];
    // refreshCreds: Function;
    credsStatus: string;
    editCredId: Function;
    createCredential: Function
}
type stateType = {
}

export class CredsList extends React.Component<paramsType, stateType> {
    static notProse = true;
    constructor(props) {
        super(props);
    }
    render() {
        const {allCreds} = this.props
        return this.renderResultsTable(allCreds);
    }

    renderResultsTable(filteredCreds: RegisteredCredentialForUpdate[]) {
        const {
            createCredential
        } = this.props
        return (
            <Prose className="">
                <table>
                    <thead>
                        <tr>
                            <th scope="col">Type</th>
                            <th scope="col">Name</th>
                            <th scope="col">Issuer</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCreds.map(
                            ({
                                id, cred
                            }) => (
                                <tr key={`table-${id}`}>
                                    <td>{cred.credType}</td>
                                    <td>
                                        <Link href={`/certifications/${id}`}>
                                            {cred.credName}
                                        </Link>
                                    </td>
                                    <td>{cred.issuerName}</td>
                                </tr>
                            )
                        )}
                        {!filteredCreds.length && (
                            <tr>
                                <td colSpan={4} style={{ textAlign: "center" }}>
                                    No credentials are registered yet
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={2}>
                                <button
                                    className="btn border rounded"
                                    style={{
                                        padding: "0.75em",
                                        marginLeft: "0.5em",
                                        // marginTop: '-0.75em',
                                        border: "1px solid #162ed5",
                                        borderRadius: "0.5em",
                                        backgroundColor: "#142281",
                                    }}
                                    onClick={this.create}
                                >
                                    List a Credential
                                </button>
                            </td>
                            <td colSpan={2} style={{ textAlign: "right" }}>
                                {(filteredCreds.length || "") && (
                                    <>{filteredCreds.length} credentials</>
                                )}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </Prose>
        );
    }

    create = () => {
        debugger
        this.props.createCredential()
    }

}