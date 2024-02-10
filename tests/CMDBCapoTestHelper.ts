import {
    ADA,
    DefaultCapoTestHelper,
    dumpAny,
    helios,
    StellarTxnContext,
    type Wallet,
} from "@donecollectively/stellar-contracts";
import {
    CMDBCapo,
    type BookEntry,
    type BookEntryCreationAttrs,
    type BookEntryOnchain,
    type BookEntryUpdateAttrs,
    type BookEntryUpdated,
    type BookEntryUpdateOptions,
    type BookEntryForUpdate,
} from "../src/contracts/CMDBCapo.js";

export interface ResourceUpdateResult<T extends StellarTxnContext<any>> {
    txid: helios.TxId;
    resourceId: string;
    tcx: T;
};
function updatedResource<T extends StellarTxnContext<any>>(
    r: ResourceUpdateResult<T>
) {
    return r;
}

export class CMDBCapoTestHelper extends DefaultCapoTestHelper.forCapoClass(
    CMDBCapo
) {
    _start: number;
    constructor(config) {
        super(config)
        this._start = new Date().getTime();;
    }
    get relativeTs() {
        const ms = new Date().getTime() - this._start;
        const s = ms / 1000;
        return `@ ${s}s`
    }
    setupActors() {
        this.addActor("editor", 1100n * ADA, ... Array(7).fill( 7n * ADA));
        // collaborators
        this.addActor("charlie", 13n * ADA);
        this.addActor("camilla", 120n * ADA);
        this.addActor("cindy", 13n * ADA);

        // a random person
        this.addActor("ralph", 13n * ADA);

        this.currentActor = "editor";
    }
    get book() {
        return this.strella;
    }

    async editorInvitesCollaborator(collaborator: Wallet) {
        await this.bootstrap()

        if (this.actorName != "editor") {
            this.currentActor = "editor";
        }
        const { book } = this;
        console.log("--------------------------- "+this.relativeTs +" Test helper: Create collaborator token");
        const tcx = await book.mkTxnMintCollaboratorToken(
            (await collaborator.usedAddresses)[0]
        );
        console.log("--- mkTxnMintCollaboratorToken "+ this.relativeTs);
        await book.submit(tcx);
        console.log("--- submit collaborator token "+ this.relativeTs);
        await this.network.tick(1n);
        return tcx;
    }

    async collaboratorCreatesPage(pageContent: BookEntryCreationAttrs) {
        if (!this.book) await this.bootstrap();

        console.log(
            `--------------------------- ${this.relativeTs} Test helper: Create book page '${pageContent.title}'`
        );
        const tcx = await this.book.mkTxnCreatingBookEntry({
            // entryType: "spg", // default, can be overridden
            ...pageContent,
        });
        const resourceId = tcx.state.uuts.entryId.name;
        console.log(
            "   ----- submitting txn creating book entry with id " + resourceId
        );

        return this.book.submit(tcx).then(async (txid) => {
            await this.network.tick(1n);
            return updatedResource({ txid, resourceId, tcx });
        });
    }

    async editorModifiesPage(
        entry: BookEntryForUpdate,
        updates: BookEntryUpdateAttrs
    ) {
        if (!this.book)
            throw new Error(
                `book contract not bootstrapped; no book pages can exist`
            );
        if (this.actorName != "editor") {
            this.currentActor = "editor";
        }

        console.log(
            `--------------------------- ${this.relativeTs} Test helper: Editor modifying book page`,
            entry.id
        );
        return this.collaboratorModifiesPage(entry, updates);
    }
    async collaboratorModifiesPage(
        entry: BookEntryForUpdate,
        updates: BookEntryUpdateAttrs
    ) {
        console.log(
            `  -------------------------  ${this.relativeTs} Test helper: modifying book page`,
            entry.id
        );
        debugger;
        const tcx = await this.book.mkTxnUpdatingEntry({
            ...entry,
            updated: updates,
        });
        const resourceId = tcx.state.uuts.entryId.name;
        console.log("    ----- updating book entry with id " + resourceId, {
            updates,
        });
        return this.book.submit(tcx).then(
            async (txid) => {
                await this.network.tick(1n);

                return updatedResource({ txid, resourceId, tcx });
            }
        );
    }

    async collaboratorSuggestsChange(
        entry: BookEntryForUpdate,
        updates: BookEntryUpdateAttrs
    ) {
        if (!this.book)
            throw new Error(
                `book contract not bootstrapped; no book pages can exist`
            );

        console.log(
            `---------------------------  ${this.relativeTs} Test helper: Suggest book page update`,
            entry.id
        );
        const tcx = await this.book.mkTxnSuggestingUpdate({
            ...entry, 
            updated: updates
        });
        const resourceId = tcx.state.uuts.entryId.name;

        return this.book.submit(tcx).then(
            (txid) => {
                this.network.tick(1n);

                return updatedResource({ 
                    txid, 
                    resourceId, 
                    tcx 
                });
            }
        )
    }

    async acceptSuggestions(
        page: BookEntryForUpdate, 
        suggestions: BookEntryForUpdate[],
        merged? : Partial<Pick<BookEntryUpdateAttrs, "content" | "title">>
    ) {
        if (!this.book)
            throw new Error(
                `book contract not bootstrapped; no book pages can exist`
            );

        console.log(
            `---------------------------  ${this.relativeTs} Test helper: suggestion being accepted`,
            page.id
        );
        const tcx = await this.book.mkTxnAcceptingPageChanges(
            page, suggestions, merged
        );
        const resourceId = tcx.state.uuts.entryId.name;
        console.log(
            "               -------------------------------------\nbefore submitting suggestion-merge", 
            dumpAny(tcx, this.book.networkParams)
        )
        return this.book.submit(tcx).then(
            (txid) => {
                this.network.tick(1n);

                return updatedResource({ 
                    txid, 
                    resourceId, 
                    tcx 
                });
            }
        )

    }

}
