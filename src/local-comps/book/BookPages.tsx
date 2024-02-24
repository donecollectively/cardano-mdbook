import React from "react";
import link from "next/link.js";
const Link = link.default;

import { CMDBCapo } from "../../contracts/CMDBCapo.js";
import type {
    BookEntryForUpdate,
    BookEntryOnchain,
    BookIndex,
    BookIndexEntry,
} from "../../contracts/CMDBCapo.js";
import { Prose } from "../../components/Prose.jsx";
import { hasBookMgr } from "./sharedPropTypes.js";

type propsType = {
    bookDetails: BookEntryForUpdate[];
    // refreshCreds: Function;
    bookMgrStatus: string;
    createBookEntry: Function;
    isCollaborator?: true;
    index: BookIndex
} & hasBookMgr;
type stateType = {};

export class BookPages extends React.Component<propsType, stateType> {
    static notProse = true;
    constructor(props) {
        super(props);
    }
    render() {
        const { 
            bookDetails,
            index,
        } = this.props;

        const indexEntries = Object.entries(index).map( ([k,v]) => v);
        return this.renderResultsTable(indexEntries);
    }

    get router() {
        return this.props.mgr.router;
    }

    editItem(id) {
        this.router.push(`/book/${id}/edit`, "", { shallow: true });
    }

    renderResultsTable(filteredBookDetails: BookIndexEntry[]) {
        const { isCollaborator } = this.props;
        const { pageViewUrl, goEditPage } = this.props.mgr;
        return (
            <Prose className="">
                <table>
                    <thead>
                        <tr>
                            <th scope="col" className="pl-2">Name</th>
                            <th scope="col">Type</th>
                            <th scope="col">Pending changes</th>
                            
                            <th scope="col">Created by</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredBookDetails.map(
                            ({ 
                                pendingChanges = [],
                                pageEntry: {
                                    id, entry, ownerAuthority 
                                }
                            }) => (
                                <tr
                                    key={`table-${id}`}
                                    className="hover:bg-slate-800 hover:text-slate-300 dark:hover:bg-slate-950 dark:hover:text-slate-300"
                                    onDoubleClick={goEditPage.bind(this, id)}
                                >
                                    <td className="pl-2">
                                        <Link href={pageViewUrl(id)}>
                                            {entry.title}
                                        </Link>
                                    </td>                                    
                                    <td>
                                        {"spg" == entry.entryType
                                            ? "Suggested Page"
                                            : "sug" == entry.entryType ? "Changes"
                                            : "Page"}
                                        {/* &nbsp;{entry.entryType /*temp*/}
                                    </td>
                                    <td>
                                        {pendingChanges.length}
                                    </td>
                                    <td className="pr-2">
                                        {ownerAuthority.uutName}
                                    </td>
                                </tr>
                            )
                        )}
                        
                        {!filteredBookDetails.length && (
                            <tr>
                                <td colSpan={3} style={{ textAlign: "center" }}>
                                    This book has no topics
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colSpan={2}>
                                {isCollaborator && (
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
                                        Add a Topic
                                    </button>
                                )}
                            </td>
                            <td colSpan={2} style={{ textAlign: "right" }}>
                                {(filteredBookDetails.length || "") && (
                                    <>
                                        {filteredBookDetails.length} topic(s)
                                    </>
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
