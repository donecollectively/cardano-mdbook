import {
    ADA,
    DefaultCapoTestHelper,
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

type ResourceUpdateResult<T extends StellarTxnContext<any>> = {
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
    setupActors() {
        this.addActor("editor", 1100n * ADA);
        this.addActor("charlie", 13n * ADA);
        this.addActor("camilla", 120n * ADA);
        this.currentActor = "editor";
    }
    get book() {
        return this.strella;
    }

    async editorInvitesCollaborator(collaborator: Wallet) {
        if (!this.book) await this.bootstrap();
        if (this.actorName != "editor") {
            this.currentActor = "editor";
        }
        const { book } = this;
        console.log("--------------------------- Create collaborator token");
        const tcx = await book.mkTxnMintCollaboratorToken(collaborator.address);
        await book.submit(tcx);
        await this.network.tick(1n);
        return tcx;
    }

    async collaboratorCreatesPage(pageContent: BookEntryCreationAttrs) {
        if (!this.book) await this.bootstrap();

        console.log(
            `--------------------------- Create book page '${pageContent.title}'`
        );
        const tcx = await this.book.mkTxnCreatingBookEntry({
            entryType: "spg",
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
            "--------------------------- Editor modifying book page",
            entry.id
        );
        return this.collaboratorModifiesPage(entry, updates);
    }
    async collaboratorModifiesPage(
        entry: BookEntryForUpdate,
        updates: BookEntryUpdateAttrs
    ) {
        console.log(
            "  ------------------------- modifying book page",
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
            },
            (e) => {
                throw e;
            }
        );
    }

    async collaboratorSuggestsChange() {}

    async editorAcceptsSuggestion() {}

    async ownerAcceptsSuggestion() {}
}
