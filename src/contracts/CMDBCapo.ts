import type {
    SeedTxnParams,
    RelativeDelegateLink,
    hasUutContext,
} from "@donecollectively/stellar-contracts";

import {
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
    helios,
    txn,
    dumpAny,
} from "@donecollectively/stellar-contracts";

const { Value, TxOutput, Datum } = helios;
import { 
    TxInput, 
    type TxInput as TxInputType,
    UutName 
} from "@donecollectively/stellar-contracts";

import type {
    isActivity,
    InlineDatum,
} from "@donecollectively/stellar-contracts";

//@ts-expect-error importing a file typescript isn't expected to understand
import specializedCapo from "./specializedCMDBCapo.hl"; // assert { type: 'text' };

import { CMDBMintDelegate } from "./CMDBMintDelegate.js";

export type BookEntryOnchain = {
    ownerAuthority: RelativeDelegateLink<AuthorityPolicy>;
    entry: BookEntry;
};

export type forOnChainEntry<
    VARIANT extends
        | BookEntryCreationAttrs
        | BookEntryUpdateAttrs
        | BookSuggestionAttrs
> = {
    ownerAuthority: RelativeDelegateLink<AuthorityPolicy>;

    entry: VARIANT;
};

export type BookEntryUpdateOptions = {
    isEditor: boolean;
    hasOwnership: boolean;
    // collabUut: UutName;
    saveAs: "update" | "suggestion";
};

export type BookEntry = {
    entryType: string;
    title: string;
    content: string;
    suggestedBy?: string;
    createdAt: bigint;
    updatedAt: bigint;
    expiresAt: bigint;
};

export type BookEntryCreationAttrs = Pick<
    BookEntry,
    "title" | "content" | "entryType"
>;
export type RoleInfo = { utxo: TxInput; uut: UutName };

export type BookEntryUpdateAttrs = BookEntryCreationAttrs &
    Pick<BookEntry, "createdAt" | "expiresAt">;

export type BookSuggestionAttrs = BookEntryCreationAttrs &
    Required<Pick<BookEntry, "suggestedBy">>;

type entryId = string;
export type BookEntryCreate = forOnChainEntry<BookEntryCreationAttrs> & {
    id: entryId;
};

export type BookSuggestionCreate = forOnChainEntry<BookSuggestionAttrs> & {
    id: entryId;
};

export type BookEntryForUpdate = BookEntryOnchain & {
    id: entryId;
    utxo: TxInput;
    updated?: BookEntryUpdateAttrs;
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
        const { updatingEntry } = this.onChainActivitiesType;
        const t = new updatingEntry();

        return { redeemer: t._toUplcData() };
    }

    @datum
    mkDatumBookEntry<T extends BookEntryCreate | BookEntryUpdated>(
        d: T
    ): InlineDatum {
        //!!! todo: make it possible to type these datum helpers more strongly
        //  ... at the interface to Helios
        console.log("--> mkDatumBookEntry", d);
        const { BookEntry: hlBookEntry } = this.onChainDatumType;
        const { BookEntryStruct: hlBookEntryStruct } = this.onChainTypes;

        //@ts-expect-error can't seem to tell the the Updated alternative actually does have this attribut,
        //    ... just because the Create alternative does not...
        const rec: BookEntry = d.updated || (d.entry as BookEntry);

        //@ts-expect-error because of how we probe through T for the BookEntryUpdated attribute
        if (d.updated) {
            //@ts-expect-error ditto, createdAt
            rec.createdAt = d.entry.createdAt;
            rec.updatedAt = BigInt(Date.now());
        } else {
            rec.createdAt = BigInt(Date.now());
            rec.updatedAt = 0n;
        }
        rec.expiresAt = BigInt(Date.now() + 364 * 24 * 60 * 60 * 1000);
        const { entryType, title, content, createdAt, updatedAt, expiresAt } =
            rec;

        const ownerAuthority = this.mkOnchainDelegateLink(d.ownerAuthority);
        const bookEntryStruct = new hlBookEntryStruct(
            entryType,
            title,
            content,
            createdAt,
            updatedAt,
            expiresAt
        );
        const t = new hlBookEntry(ownerAuthority, bookEntryStruct);
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
    // @txn
    async mkTxnCreatingBookEntry<TCX extends StellarTxnContext<any>>(
        entry: BookEntryCreationAttrs,
        iTcx?: TCX
    ): Promise<TCX> {
        // to make a new book entry, we must:
        //  - make a UUT for the record (in-contract datum)
        //     - includes the mint-delegate for authorizing creation of the entry
        //  - assign the user's collaborator token as the administrative authority

        const myCollabRoleInfo = await this.findUserRoleInfo("collab");
        if (!myCollabRoleInfo)
            throw new Error(
                `connected wallet doesn't have a collab-* token`
            );
        const myEditorToken: TxInput | undefined =
            await this.findGovAuthority();

        if (!myCollabRoleInfo && !myEditorToken) {
            const message = `It looks like you're not a collaborator on this project.  Are you connected with a wallet having collab-* token from policyId ${this.mph.hex} ?`;

            throw new Error(message);
        }

        const tcx1 = await this.mkTxnMintingUuts(
            iTcx || new StellarTxnContext<any>(this.myActor),
            ["eid"],
            undefined,
            {
                entryId: "eid",
            }
        );
        const tcx1a: typeof tcx1 & hasUutContext<"ownerAuthority" | "collab"> =
            tcx1.addInput(myCollabRoleInfo.utxo);

        console.log(tcx1a.dump());
        const tcx1b = myEditorToken
            ? await this.txnAddGovAuthorityTokenRef(tcx1a)
            : tcx1a;

        //!!! todo: finish adding myEditorToken support to this code path
        const collaborator: UutName =
            (tcx1b.state.uuts.ownerAuthority =
            tcx1b.state.uuts.collab =
                myCollabRoleInfo.uut);
        // this.mkUutName("collab", myCollabRoleInfo));

        //  - create a delegate-link connecting the entry to the collaborator
        const ownerAuthority = this.txnCreateConfiguredDelegate(
            tcx1b,
            "ownerAuthority",
            {
                strategyName: "address",
                config: {
                    // !!! TODO: look into why this shows up as type Partial<any>
                    addrHint: [myCollabRoleInfo.utxo.origOutput.address],
                },
            }
        );
        const tenMinutes = 1000 * 60 * 10;

        //  - send the ownerAuthz UUT to the user
        const tcx2 = await ownerAuthority.delegate.txnReceiveAuthorityToken(
            tcx1b,
            this.uutsValue(collaborator)
        );
        tcx2.validFor(tenMinutes);

        //  - combine the delegate-link with the entry, to package it for on-chain storage
        //  - send the entry's UUT to the contract, with the right on-chain datum
        const tcx3 = this.txnReceiveBookEntry(tcx2, {
            ownerAuthority,
            id: tcx2.state.uuts.entryId.name,
            entry: entry,
        });
        console.warn("after receiveBookEntry", dumpAny(tcx3.tx));
        // debugger;
        return tcx3 as TCX & typeof tcx2 & typeof tcx1a;
    }

    mkEntryIndex(
        entries: BookEntryForUpdate[]
    ): Record<string, BookEntryForUpdate> {
        const entryIndex: Record<string, BookEntryForUpdate> = {};
        for (const e of entries) {
            entryIndex[e.id] = e;
        }
        return entryIndex;
    }

    async findBookEntries() {
        const found = await this.network.getUtxos(this.address);
        const { mph } = this;

        const bookDetails: BookEntryForUpdate[] = [];
        const waiting: Promise<any>[] = [];
        for (const utxo of found) {
            waiting.push(
                this.readBookEntry(utxo).then((entry) => {
                    if (!entry) return;
                    bookDetails.push(entry);
                })
            );
        }
        await Promise.all(waiting);
        return bookDetails;
    }

    async findOwnershipRoleInfo(
        entryForUpdate: BookEntryForUpdate // !!! or a more generic type
    ) : Promise<RoleInfo | undefined> {
        const collabInfo = await this.findUserRoleInfo("collab");

        if (!this.userHasOwnership(entryForUpdate, collabInfo)) return undefined
        return collabInfo
    }

    userHasOwnership(
        entryForUpdate: BookEntryForUpdate, // !!! or a more generic type
        collabInfo: RoleInfo, 
    ) {
        const {
            ownerAuthority,
        } = entryForUpdate

        const {uut:{name: userCollabTokenName}} = collabInfo;
        const {uutName: ownerUutName} = ownerAuthority;

        const hasOwnership = !!(userCollabTokenName == ownerUutName);
        console.log("     🐞 hasOwnership?: ", {userCollabTokenName, ownerUutName, hasOwnership});
        return hasOwnership
    }

    async txnAddOwnershipToken<TCX extends StellarTxnContext<any>>(
        tcx: TCX,
        entryForUpdate: BookEntryForUpdate // !!! or a more generic type
    ) {
        const ownerDelegate = await this.getOwnerDelegate(
            entryForUpdate
        );

        return ownerDelegate.txnGrantAuthority(
            tcx
        );
    }

    /**
     * Updates a book entry's utxo with new details
     * @remarks
     *
     * detailed remarks
     * @param entryForUpdate - update details
     * @reqt updates all the details found in the `entryForUpdate`
     * @reqt fails if the owner's contributor-token (or charter authz) is not found in the user's wallet
     * @public
     **/
    @txn
    async mkTxnUpdatingEntry(
        entryForUpdate: BookEntryForUpdate
    ): Promise<StellarTxnContext<any>> {
        const {
            // id,
            utxo: currentEntryUtxo,
            ownerAuthority,
            entry: entry,
            updated,
        } = entryForUpdate;

        const tenMinutes = 1000 * 60 * 10;

        const ownerCollabInfo = await this.findOwnershipRoleInfo(entryForUpdate);
        console.log("   🐞 ownership info: ", ownerCollabInfo);

        const editorInfo = await this.findUserRoleInfo("capoGov");
        //! identifies ownership ONLY if current user holds the correct authority token
        const isEditor = !!(editorInfo?.uut);

        if (ownerCollabInfo) {
            const tcx = await this.txnAddUserCollabRole(
                new StellarTxnContext<any>(),
                ownerCollabInfo
            );
            console.log("   🐞 book entry update, with ownership")
            const tcx2 = tcx
                .attachScript(this.compiledScript)
                .addInput(currentEntryUtxo, this.activityUpdatingEntry())
                .validFor(tenMinutes);

            return this.txnReceiveBookEntry(tcx2, entryForUpdate);
        } else if (isEditor) {
            const tcx1 = await this.txnAddGovAuthorityTokenRef(
                new StellarTxnContext<any>()
            );
            console.log("   🐞 book entry update as editor", dumpAny(tcx1));

            // const tcx1a = await this.txnAddGovAuthority(tcx1);
            // console.log("   🐞 added govAuthority", dumpAny(tcx1a));
            const collabInfo = await this.findUserRoleInfo("collab");

            const tcx2 = await this.txnAddUserCollabRole(tcx1, collabInfo);
            console.log("   🐞 added editor collab role", dumpAny(tcx2));

            const tcx3 = tcx2
                .attachScript(this.compiledScript)
                .addInput(currentEntryUtxo, this.activityUpdatingEntry())
                .validFor(tenMinutes);

            return this.txnReceiveBookEntry(tcx3, entryForUpdate);
        }
        throw new Error("The connected wallet doesn't have the needed editor/collaborator authority to update an entry")
    }

    async txnAddUserCollabRole<
        TCX extends StellarTxnContext<any>
    >(
        tcx: TCX, 
        userCollabToken : RoleInfo
    ) : Promise<TCX> {          
        const t: TxInputType = userCollabToken?.utxo
        if (!t) throw new Error(`addUserCollabRole: no collaborator token provided`)

        return tcx.addInput(userCollabToken.utxo).addOutput(
            t.output
        )
    }

    async mkTxnSuggestingUpdate(
        entryForUpdate: BookEntryForUpdate
    ): Promise<StellarTxnContext<any>> {
        const collabInfo = await this.findUserRoleInfo("collab");
        if (!collabInfo) {
            throw new Error(`user doesn't have a collab-* token`)
        }
        const diff = "diff placeholder" // todo: create a diff

        throw new Error(`finish implementing this`)
    }

    mkUutName(purpose: string, txin: TxInput) {
        const tokenNames = txin.value.assets
            .getTokenNames(this.mph)
            .map((x) => helios.bytesToText(x.bytes))
            .filter((x) => x.startsWith(`${purpose}-`));

        if (tokenNames.length > 1)
            console.warn(
                `mkUutName() found multiple ${purpose} tokens in one Utxo.  This one has ${tokenNames.length} that match: ` +
                    tokenNames.join(", ")
            );

        return new UutName(purpose, tokenNames[0]);
    }

    async findUserRoleUtxo(
        roleUutPrefix: string
    ): Promise<TxInput | undefined> {
        throw new Error("obsolete?");
        return (await this.findUserRoleInfo(roleUutPrefix))?.utxo;
    }

    async findUserRoleInfo(
        roleUutPrefix: string
    ): Promise<undefined | RoleInfo> {
        const utxos: TxInput[] = await this.wallet.utxos;
        console.info(
            `found ${utxos.length} wallet utxos, in pursuit of ${roleUutPrefix}-* token from ${this.mph.hex}`
        );

        const rv: RoleInfo = {
            utxo: undefined,
            uut: undefined,
        };
        for (const u of utxos) {
            const tokenNamesExisting = u.value.assets
                .getTokenNames(this.mph)
                .map((x) => helios.bytesToText(x.bytes));
            // if (tokenNamesExisting.length) debugger
            const tokenNames = tokenNamesExisting.filter((x) => {
                // console.info("   - found token name: "+x);
                return !!x.startsWith(`${roleUutPrefix}-`);
            });
            for (const tokenName of tokenNames) {
                rv.utxo = u;
                rv.uut = new UutName(roleUutPrefix, tokenName);
                return rv;
            }
        }
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
    txnReceiveBookEntry<TCX extends StellarTxnContext<any>>(
        tcx: TCX,
        entry: BookEntryForUpdate | BookEntryCreate
    ): TCX & hasUutContext<"eid" | "entryId"> {
        const entryMinValue = this.mkMinTv(this.mph, entry.id);
        const newDatum = this.mkDatumBookEntry(entry);
        const utxo = new TxOutput(this.address, entryMinValue, newDatum);
        const fake = 0;
        const txId = new Array(32);
        txId.fill(fake);

        const txin = new helios.TxInput(
            new helios.TxOutputId([txId, fake]),
            utxo
        );

        tcx.state.newEntry = this.readBookEntry(txin);
        //!!! todo: make adding UUTs more of a utility, with implicit type
        tcx.state.uuts = tcx.state.uuts || {};
        tcx.state.uuts.entryId = 
        tcx.state.uuts.eid  = new UutName("eid", entry.id);
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
    findBookUtxo(entryId: string) {
        return this.mustFindMyUtxo(
            "book entry",
            this.mkTokenPredicate(this.mph, entryId),
            `not found in book contract: entry with id ${entryId}`
        );
    }

    /**
     * Reads the datum details for a given BookEntry id
     * @remarks
     *
     * Asynchronously reads the UTxO for the given id and returns its underlying datum via {@link CMDBCapo.readBookEntry}
     *
     * @param entryId - the UUT identifier regCred-xxxxxxxxxx
     * @public
     **/
    async findBookEntry(entryId: string) {
        const utxo = await this.findBookUtxo(entryId);
        return this.readBookEntry(utxo);
    }

    /**
     * Reads the datum details for a BookEntry datum from UTxO
     * @remarks
     *
     * Parses the UTxO for the given id.
     *
     * If you have a entryId, you can use {@link CMDBCapo.findBookEntry} instead.
     *
     * The resulting data structure includes the actual on-chain data
     * as well as the `id` actually found and the `utxo` parsed, for ease
     * of updates via {@link CMDBCapo.mkTxnUpdatingEntry}
     *
     * @param utxo - a UTxO having a registry-entry datum, such as found with {@link CMDBCapo.findBookUtxo}
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
            "BookEntry",
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
        entry: BookEntryOnchain | forOnChainEntry<any>
    ): Promise<AuthorityPolicy>;
    async getOwnerDelegate(entryId: string): Promise<AuthorityPolicy>;
    async getOwnerDelegate(
        entryOrId: string | BookEntryOnchain
    ): Promise<AuthorityPolicy> {
        const entry: forOnChainEntry<any> =
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
     * Creates a transaction minting a collaborator token
     * @remarks
     *
     * Sends the collaborator token to the provided address
     * @param address - recipient of the collaborator token
     * @public
     **/
    @txn
    async mkTxnMintCollaboratorToken(addr: Address) {
        const tcx: hasUutContext<"collab"> = new StellarTxnContext();

        const tcx2 = await this.mkTxnMintingUuts(tcx, ["collab"]);
        return tcx2.addOutput(
            new helios.TxOutput(
                addr,
                this.mkMinTv(this.mph, tcx2.state.uuts.collab)
            )
        );
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
                requires: ["page expiration"],
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
                requires: ["The workflow guards against change conflict"],
            },

            "page expiration": {
                purpose:
                    "for proactive freshness even in the face of immutable content",
                details: [
                    "Book pages expire by default, and can be freshened as long as they remain relevant.",
                    "This way, obsolete content is naturally hidden, ",
                    "  ... while remaining available for review/update/freshening",
                ],
                mech: [
                    "expired pages are hidden by default",
                    "expired pages can be freshened by the book's operator, with or without content changes",
                    "FUT: expired pages can be freshened implicitly by a collaborator suggesting a fresh change that resolves any obsolescense",
                ],
            },

            "The workflow guards against change conflict": {
                purpose:
                    "So that people can easily avoid merging suggestions that have become obsolete",
                details: [
                    "On-chain logic can't be expected to validate diffs.  ",
                    "However, the application layer can validate that diffs can be applied cleanly.",
                    "And, it can require the person who merges a conflicting change to review the results.",
                ],
                mech: [
                    "A diff that conflicts can't be merged until it is updated to apply cleanly",
                    "A diff that applies cleanly can be merged with no extra confirmation",
                    "Two diffs, applied in a different areas of a page, can both be merged without extra confirmation",
                ],
                requires: [],
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
