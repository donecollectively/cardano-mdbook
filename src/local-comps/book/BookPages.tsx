import React from "react";
import {
    CMDBCapo,
    BookEntryForUpdate,
    BookEntryOnchain,
} from "../../contracts/CMDBCapo.js";
import { Prose } from "../../components/Prose.jsx";
import link from "next/link.js";
const Link = link.default;

type paramsType = {
    bookContract: CMDBCapo;
    bookDetails: BookEntryForUpdate[];
    // refreshCreds: Function;
    credsStatus: string;
    editCredId: Function;
    createBookEntry: Function;
};
type stateType = {};

export class CredsList extends React.Component<paramsType, stateType> {
    static notProse = true;
    constructor(props) {
        super(props);
    }
    render() {
        const { bookDetails: bookDetails } = this.props;
        return this.renderResultsTable(bookDetails);
    }

    renderResultsTable(filteredBookDetails: BookEntryForUpdate[]) {
        const { createBookEntry: createCredential } = this.props;
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
                            ({
                                id, cred
                            }) => (
                                <tr key={`table-${id}`}>
                                    <td>{cred.credType}</td>
                                    <td>
                                        <Link href={`/book/${id}`}>
                                            {cred.credName}
                                        </Link>
                                    </td>
                                    <td>{cred.issuerName}</td>
                                </tr>
                            )
                        )}
                        {filteredBookDetails.map(({ id, cred }) => (
                        {!filteredBookDetails.length && (
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
                                {(filteredBookDetails.length || "") && (
                                    <>{filteredBookDetails.length} topics  !!! todo: filter for top-level topics / topic-count</>
                                )}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </Prose>
        );
    }

    create = () => {
        this.props.createBookEntry();
    };
}
