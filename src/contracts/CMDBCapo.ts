import {
    SeedTxnParams,
    mkHeliosModule,
    DefaultCapo,
    hasReqts,
    defineRole,
    StellarTxnContext,
    Activity,
    partialTxn,
    Address,
    datum,
    AuthorityPolicy,
    RelativeDelegateLink,
    stellarSubclass,
    strategyValidation,
    helios,
    txn,
    dumpAny,
} from "@donecollectively/stellar-contracts";

const { Value, TxOutput, Datum } = helios;
import type {
    InlineDatum,
    isActivity,
    TxInput,
    UutName,
} from "@donecollectively/stellar-contracts";

//@ts-expect-error importing a file typescript isn't expected to understand
import specializedCapo from "./specializedCMDBCapo.hl"; // assert { type: 'text' };

import { CMDBMintDelegate } from "./CMDBMintDelegate.js";

export type BookEntryOnchain = {
    ownerAuthority: RelativeDelegateLink<AuthorityPolicy>;
    entry: BookEntry;
};

export type BookEntry = {
    entryType: string;
    title: string;
    content: string;
    suggestedBy: string;
    createdAt: bigint;
    updatedAt: bigint;
    expiresAt: bigint;
};

type entryId = string;
export type BookEntryCreate = BookEntryOnchain & {
    id: entryId;
};

export type BookEntryForUpdate = BookEntryOnchain & {
    id: entryId;
    utxo: TxInput;
    updated?: BookEntry;
};
export type BookEntryUpdated = {
    updated: BookEntry;
} & BookEntryForUpdate;

export class CMDBCapo extends DefaultCapo {
    get specializedCapo() {
        return mkHeliosModule(
            specializedCapo,
            "src/contracts/specializedCMDBCapo.hl"
        );
    }

    static get defaultParams() {
        return {};
    }

    @Activity.redeemer
    protected activityUpdatingEntry(): isActivity {
        const { updatingCredential } = this.onChainActivitiesType;
        const t = new updatingCredential();

        return { redeemer: t._toUplcData() };
    }

    @datum
    mkDatumRegisteredCredential<
        T extends BookEntryCreate | BookEntryUpdated
    >(d: T): InlineDatum {
        //!!! todo: make it possible to type these datum helpers more strongly
        //  ... at the interface to Helios
        console.log("--> mkDatumCharter", d);
        const { RegisteredCredential: hlRegisteredCredential } =
            this.onChainDatumType;
        const { BookEntryStruct: hlBookEntryStruct } = this.onChainTypes;

        //@ts-expect-error can't seem to tell the the Updated alternative actually does have this attribut,
        //    ... just because the Create alternative does not...
        const rec : BookEntry = d.updated || (d.entry as BookEntry);

        //@ts-expect-error
        if (d.updated) {
            rec.createdAt = d.entry.createdAt;
            rec.updatedAt = BigInt(Date.now());
        } else {
            rec.createdAt = BigInt(Date.now());
            rec.updatedAt = 0n;
        }
        rec.expiresAt = BigInt(Date.now() + 364 * 24 * 60 * 60 * 1000);
        const {
            entryType,
            title,
            content,
            createdAt,
            updatedAt,
            expiresAt,
        } = rec;

        const ownerAuthority = this.mkOnchainDelegateLink(d.ownerAuthority);
        debugger;
        const bookEntryStruct = new hlBookEntryStruct(
            entryType,
            title,
            content,
            createdAt,
            updatedAt,
            expiresAt
        );
        const t = new hlRegisteredCredential(ownerAuthority, bookEntryStruct);
        return Datum.inline(t._toUplcData());
    }

    get delegateRoles() {
        const { mintDelegate: pMD, ...inherited } = super.delegateRoles;

        const { baseClass, uutPurpose, variants } = pMD;
        return {
            ...inherited,
            ownerAuthority: defineRole(
                "ownerAuthz",
                AuthorityPolicy,
                inherited.govAuthority.variants
            ),
            mintDelegate: defineRole(uutPurpose, baseClass, {
                default: {
                    delegateClass: CMDBMintDelegate,
                    // partialConfig: {},
                    // validateConfig(args): strategyValidation {
                    //     return undefined
                    // },
                },
            }),
        };
    }

    /**
     * Creates a new record, marking the record with the collaborator's authority token
     * @remarks
     *
     * Any collaborator can create a suggested-page or edit-suggestion, by submitting key
     * information, along with their collaborator token
     * 
     * @param entry - details of the listing
     * @param iTcx - optional initial transaction context
     * @public
     **/
    @txn
    async mkTxnCreatingBookEntry<TCX extends StellarTxnContext<any>>(
        entry: BookEntry,
        iTcx?: TCX
    ): Promise<TCX> {
        // to make a new book entry, we must:
        //  - make a UUT for the record (in-contract datum)
        //     - includes the mint-delegate for authorizing creation of the entry
        //  - assign the user's collaborator token as the administrative authority

        const tcx = await this.mkTxnMintingUuts(
            iTcx || new StellarTxnContext<any>(this.myActor),
            ["eid" ],
            undefined,
            {
                entryId: "eid",
            }
        );

        //  - create a delegate-link connecting the entry to the collaborator
        const ownerAuthority = this.txnCreateConfiguredDelegate(
            tcx,
            "ownerAuthority",
            {
                strategyName: "address",
                config: {
                    addrHint: await this.wallet.usedAddresses,
                },
            }
        );
        const tenMinutes = 1000 * 60 * 10;


        const owner: UutName = tcx.state.uuts.ownerAuthz;
        //  - send the ownerAuthz UUT to the user
        const tcx2 = await ownerAuthority.delegate.txnReceiveAuthorityToken(
            tcx,
            this.uutsValue(owner)
        );
        tcx2.validFor(tenMinutes);

        //  - combine the delegate-link with the entry, to package it for on-chain storage
        //  - send the entry's UUT to the contract, with the right on-chain datum
        const tcx3 = this.txnReceiveEntry(tcx2, {
            ownerAuthority,
            id: tcx.state.uuts.regCred.name,
            entry: entry,
        });
        console.warn("after receiveEntry", dumpAny(tcx3.tx));
        debugger;
        return tcx3 as TCX & typeof tcx2 & typeof tcx;
    }

    /**
     * adds the indicated book-entry to the current transaction
     * @remarks
     *
     * includes the book entry details in the datum of the output
     * @param tcx: transaction context
     * @param entry: properties of the new entry
     * @param existingUtxo: unused existing utxo
     * @public
     **/
    @partialTxn
    txnReceiveEntry<TCX extends StellarTxnContext<any>>(
        tcx: TCX,
        entry: BookEntryForUpdate | BookEntryCreate
    ): TCX {
        debugger;
        const entryMinValue = this.mkMinTv(this.mph, entry.id);
        const utxo = new TxOutput(
            this.address,
            entryMinValue,
            this.mkDatumRegisteredCredential(entry)
        );

        return tcx.addOutput(utxo);
    }
    // Address.fromHash(entry.ownerAuthority.delegateValidatorHash),

    /**
     * Finds and returns the UTxO matching the given UUT identifier
     * @remarks
     *
     * Throws an error if it is not found
     * @param entryId - the UUT identifier regCred-xxxxxxxxxx
     * @public
     **/
    findRegistryUtxo(entryId: string) {
        return this.mustFindMyUtxo(
            "book entry",
            this.mkTokenPredicate(this.mph, entryId),
            `not found in book contract: entry with id ${entryId}`
        );
    }

    /**
     * Reads the datum details for a given RegisteredCredential id
     * @remarks
     *
     * Asynchronously reads the UTxO for the given id and returns its underlying datum via {@link CCRegistry.readRegistryEntry}
     *
     * @param entryId - the UUT identifier regCred-xxxxxxxxxx
     * @public
     **/
    async findBookEntry(entryId: string) {
        const utxo = await this.findRegistryUtxo(entryId);
        return this.readBookEntry(utxo);
    }

    /**
     * Reads the datum details for a RegisteredCredential datum from UTxO
     * @remarks
     *
     * Parses the UTxO for the given id.
     *
     * If you have a entryId, you can use {@link CCRegistry.findBookEntry} instead.
     *
     * The resulting data structure includes the actual on-chain data
     * as well as the `id` actually found and the `utxo` parsed, for ease
     * of updates via {@link CCRegistry.mkTxnUpdatingRegistryEntry}
     *
     * @param utxo - a UTxO having a registry-entry datum, such as found with {@link CCRegistry.findRegistryUtxo}
     * @public
     **/
    async readBookEntry(
        utxo: TxInput
    ): Promise<BookEntryForUpdate | undefined> {
        const a = utxo.value.assets.getTokenNames(this.mph);
        const entryId = a
            .map((x) => helios.bytesToText(x.bytes))
            .find((x) => x.startsWith("eid-"));

        const result = await this.readDatum<BookEntryOnchain>(
            "RegisteredCredential",
            utxo.origOutput.datum as InlineDatum
        );
        if (!result) return undefined;

        return {
            ...result,
            utxo,
            id: entryId,
        };
    }

    /**
     * Instantiates and returns a delegate instance for a specific book-entry id
     * @remarks
     *
     * Resolves the delegate-link by finding the underlying utxo with findBookEntry, if needed
     * @param entry - an existing entry datum already parsed from utxo
     * @param entryId - the UUT identifier eid-xxxxxxxxxx
     * @public
     **/
    async getOwnerDelegate(
        entry: BookEntryOnchain
    ): Promise<AuthorityPolicy>;
    async getOwnerDelegate(entryId: string): Promise<AuthorityPolicy>;
    async getOwnerDelegate(
        entryOrId: string | BookEntryOnchain
    ): Promise<AuthorityPolicy> {
        const entry: BookEntryOnchain =
            "string" == typeof entryOrId
                ? await this.findBookEntry(entryOrId)
                : entryOrId;

        const delegate = await this.connectDelegateWithLink(
            "ownerAuthority",
            entry.ownerAuthority
        );
        return delegate;
    }

    /**
     * Updates a book entry's utxo with new details
     * @remarks
     *
     * detailed remarks
     * @param ‹pName› - descr
     * @reqt updates all the details found in the `update`
     * @reqt fails if the `entryId` is not found
     * @reqt fails if the owner UUT (or charter authz) is not found in the user's wallet
     * @public
     **/
    @txn
    async mkTxnUpdatingEntry(
        entryForUpdate: BookEntryUpdated
    ): Promise<StellarTxnContext<any>> {
        const {
            // id,
            utxo: currentUtxo,
            ownerAuthority,
            entry: entry,
            updated,
        } = entryForUpdate;

        const ownerDelegate = await this.getOwnerDelegate(entryForUpdate);
        //!!! todo get charter-authz instead if possible, or fail if needed

        const tcx = await ownerDelegate.txnGrantAuthority(
            new StellarTxnContext<any>()
        );

        const tenMinutes = 1000 * 60 * 10;
        const tcx2 = tcx
            .attachScript(this.compiledScript)
            .addInput(currentUtxo, this.activityUpdatingEntry())
            .validFor(tenMinutes);
        return this.txnReceiveEntry(tcx2, entryForUpdate);
    }

    requirements() {
        return hasReqts({
            "the book's operator can create pages in the book": {
                purpose: "clear authority for now, extensibility for later",
                details: [
                    "The book's authority token is issued to a wallet for now,",
                    "  ... and later, can be decentralized further",
                ],
                mech: [
                    "The holder of the contract's charter-authority token can directly create book pages",
                    "Pages are created with type='pg' for Page",
                ],
                requires: [
                    "page expiration"
                ],
            },

            "collaborators can suggest pages to be added in the book": {
                purpose: "testnet: enable collaboration for invitees",
                details: [
                    "People can post page suggestions into the book once they have a collaborator token",
                    "Each book is operated by people who can exercise oversight authority over their books",
                ],
                mech: [
                    "creates page records with type='spg' for Suggested Page",
                    "the suggestor's collaborator token is referenced as the page's ownerAuthority",
                    "the suggestor can make changes to the page before it is accepted",
                ],
                requires: [
                    "contributor tokens can be minted by the book's operator",
                    "page expiration",
                ],
            },

            "collaborators can suggest changes to an existing book page": {
                purpose: "testnet: enable collaboration for invitees",
                details: [
                    "People can post page suggestions into the book once they have a collaborator token",
                    "Each book is operated by people who can exercise oversight authority over their books",
                ],
                mech: [
                    "creates page records with type='spg' for Suggested Page",
                    "the suggestor's collaborator token is referenced as the page's ownerAuthority",
                    "the suggestor can make changes to the page before it is accepted",
                ],
                requires: [
                    "contributor tokens can be minted by the book's operator",
                    "page expiration",
                ],
            },

            "contributor tokens can be minted by the book's operator": {
                purpose:
                    "creates positive control for who can be a contributor",
                details: [
                    "The book's operations staff can approve the minting of collaborator tokens.",
                    "These tokens give the holder permission to suggest new pages or changes to existing pages",
                ],
                mech: [
                    "the charter-authority token is required for minting collaborator tokens",
                    "the collaborator token can be sent directly to the collaborator",
                ],
            },
            "the book's operator can adopt proposed changes to the book": {
                purpose: "",
                details: [
                    "When suggestions have been made, the book's operator retains authority for adopting the suggestions.",
                ],
                mech: [
                    "When a suggestion is accepted, its uut is burned, with its minUtxo sent to its originator",
                ],
                requires: [
                    "The workflow guards against change conflict"
                ]
            },            

            "page expiration": {
                purpose: "for proactive freshness even in the face of immutable content",
                details: [
                    "Book pages expire by default, and can be freshened as long as they remain relevant.",
                    "This way, obsolete content is naturally hidden, ",
                    "  ... while remaining available for review/update/freshening"
                ],
                mech: [
                    "expired pages are hidden by default",
                    "expired pages can be freshened by the book's operator, with or without content changes",
                    "FUT: expired pages can be freshened implicitly by a collaborator suggesting a fresh change that resolves any obsolescense",
                ],
            },

            "The workflow guards against change conflict": {
                purpose: "So that people can easily avoid merging suggestions that have become obsolete",
                details: [
                    "On-chain logic can't be expected to validate diffs.  ",
                    "However, the application layer can validate that diffs can be applied cleanly.",
                    "And, it can require the person who merges a conflicting change to review the results."
                ],
                mech: [
                    "A diff that conflicts can't be merged until it is updated to apply cleanly",
                    "A diff that applies cleanly can be merged with no extra confirmation",
                    "Two diffs, applied in a different areas of a page, can both be merged without extra confirmation"
                ],
                requires: [

                ],
            },

            "page deletion": {
                purpose:
                    "for proactive assurance of freshness and quality of each page and the book overall",
                details: [
                    "The book's operator can revoke a listing.",
                    "A revoked listing MUST NOT be considered an active page in the book.",
                ],
                mech: [
                    "A deletion is allowed for the holder of govAuthority token",
                ],
                requires: [
                    // "FUT: A virtual deletion can be developed by momentum of collaborators"
                ],
            },

            "a listing can be freshened by the holder of the linked authority token":
                {
                    purpose:
                        "allowing update and preventing the expiration of a listing",
                    details: [],
                    mech: [],
                    requires: [],
                },

        });
    }
}
