import {
    Diff,
    applyPatch,
    createPatch,
    diffChars,
    diffLines,
    diffSentences,
    parsePatch,
    structuredPatch,
} from "diff";

import type {
    SeedTxnParams,
    RelativeDelegateLink,
    hasUutContext,
    hasSeedUtxo,
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
    mkValuesEntry,
} from "@donecollectively/stellar-contracts";

const {
    Value,
    TxOutput,
    Datum,
    //@ts-expect-error
    Option,
    TxOutputId,
} = helios;

import {
    TxInput,
    type TxInput as TxInputType,
    UutName,
} from "@donecollectively/stellar-contracts";

import type {
    isActivity,
    InlineDatum,
} from "@donecollectively/stellar-contracts";

//@ts-expect-error importing a file typescript isn't expected to understand
import specializedCapo from "./specializedCMDBCapo.hl"; // assert { type: 'text' };

import { CMDBMintDelegate } from "./CMDBMintDelegate.js";
import { CMDBController } from "./CMDBController.js";

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
    entryType: "pg" | "spg" | "sug";
    title: string;
    content: string;
    createdAt: bigint;
    updatedAt: bigint;
    expiresAt: bigint;
    changeParentEid?: string;
    changeParentTxId?: helios.TxId;
    changeParentOidx?: number;
    appliedChanges?: string[];
    //! TODO:  rejectedChanges?: string[];
    // suggestedBy?: string; // XXX see delegate link, whose content serves the same purpose
};

export type BookIndexEntry = {
    pageEntry: BookEntryForUpdate;
    changes: ChangeDetails[];
};

export type ChangeDetails = {
    change: BookEntryForUpdate;
} & (
    | {
          isCurrent: true;
      }
    | {
          isCurrent: false;
          baseEntry: BookEntryForUpdate;
      }
);

export type BookEntryCreationAttrs = Pick<
    BookEntry,
    | "title"
    | "content"
    | "entryType"
    | "changeParentEid"
    | "changeParentTxId"
    | "changeParentOidx"
>;
export type RoleInfo = { utxo: TxInput; uut: UutName };

export type BookEntryUpdateAttrs = BookEntryCreationAttrs &
    Pick<BookEntry, "appliedChanges" | "createdAt" | "expiresAt">;

export type BookSuggestionAttrs = BookEntryCreationAttrs &
    Required<Pick<BookEntry, "changeParentTxId" | "changeParentEid">>;

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

export type BookIndex = Record<string, BookIndexEntry>;

type isBurningSuggestions = { state: { burningSuggestions: UutName[] } };

export class CMDBCapo extends DefaultCapo {
    get specializedCapo() {
        return mkHeliosModule(
            specializedCapo,
            "src/contracts/specializedCMDBCapo.hl"
        );
    }
    importModules() {
        const modules = [...super.importModules(), CMDBController];
        // console.error(modules.map(x => x.moduleName));
        return modules;
    }

    static get defaultParams() {
        return {};
    }

    @Activity.redeemer
    protected activityUpdatingEntry(): isActivity {
        const Updating = this.mustGetActivity("updatingEntry");
        const t = new Updating();

        return { redeemer: t._toUplcData() };
    }

    @Activity.redeemer
    activityAcceptingChanges() {
        const Accepting = this.mustGetActivity("acceptingChanges");
        const t = new Accepting();
        return { redeemer: t._toUplcData() };
    }

    @Activity.redeemer
    activitySuggestionBeingAccepted() {
        const AcceptingOne = this.mustGetActivity("suggestionBeingAccepted");
        const t = new AcceptingOne();
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
        const {
            entryType,
            title,
            content,
            createdAt,
            updatedAt,
            expiresAt,
            appliedChanges = [],
        } = rec;
        let { changeParentTxId, changeParentEid, changeParentOidx } = rec;

        if ("sug" == entryType) {
            if (!changeParentEid) {
                throw new Error(
                    `missing required changeParentEid - a eid-* asset-name of page being changed`
                );
            }
            if (!changeParentTxId || !changeParentOidx) {
                //!!! todo: ensure refUtxo to this txid is present in the resulting txn
                throw new Error(
                    `missing required changeParentTxId / changeParentOidx - TxId/index in which the change-parent was last modified`
                );
            }
            if ("undefined" == typeof changeParentOidx) {
                throw new Error(`missing required changeParentOidx`);
            }
            console.log("changeParentTxId: ", dumpAny(changeParentTxId));
        } else {
            changeParentEid = "";
            changeParentTxId = undefined;
            changeParentOidx = undefined;
        }
        const OptTxId = Option(helios.TxId);
        const OptIndex = Option(helios.HInt);
        //@ts-expect-error
        const OptString = Option(helios.HString);
        debugger;
        const ownerAuthority = this.mkOnchainDelegateLink(d.ownerAuthority);
        const bookEntryStruct = new hlBookEntryStruct(
            entryType,
            title,
            content,
            createdAt,
            updatedAt,
            expiresAt,
            appliedChanges,
            new OptString(changeParentEid),
            new OptTxId(changeParentTxId),
            new OptIndex(changeParentOidx)
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
    async mkTxnCreatingBookEntry<TCX extends StellarTxnContext & hasSeedUtxo>(
        entry: BookEntryCreationAttrs,
        iTcx?: TCX
    ) {
        // to make a new book entry, we must:
        //  - make a UUT for the record (in-contract datum)
        //     - includes the mint-delegate for authorizing creation of the entry
        //  - assign the user's collaborator token as the administrative authority

        // !!! mock in test
        const myCollabRoleInfo = await this.findUserRoleInfo("collab");
        if (!myCollabRoleInfo)
            throw new Error(`connected wallet doesn't have a collab-* token`);
        const myEditorToken: TxInput | undefined =
            await this.findGovAuthority();

        if (!myCollabRoleInfo && !myEditorToken) {
            const message = `It looks like you're not a collaborator on this project.  Are you connected with a wallet having collab-* token from policyId ${this.mph.hex} ?`;

            throw new Error(message);
        }
        const tcx =
            iTcx ||
            (await this.addSeedUtxo(new StellarTxnContext(this.myActor)));

        const mintDelegate = await this.getMintDelegate();
        const tcx1a = await this.txnMintingUuts(
            tcx,
            ["eid"],
            {
                mintDelegateActivity: mintDelegate.activityCreatingBookPage(
                    tcx.getSeedAttrs()
                ),
            },
            {
                entryId: "eid",
            }
        );

        const tcx1b = await this.txnAddUserCollabRole(tcx1a, myCollabRoleInfo);

        // console.log(tcx1b.dump());
        console.log("################# myEditorToken", { myEditorToken });
        const tcx1c = myEditorToken
            ? await this.txnAddGovAuthorityTokenRef(tcx1b)
            : tcx1b;

        // await this.txnMustUseCharterUtxo(tcx, "refInput")

        const tcx2 =
            entry.entryType == "sug"
                ? await this.txnAddParentRefUtxo(tcx1c, entry.changeParentEid)
                : tcx1c;

        //  - create a delegate-link connecting the entry to the collaborator
        const ownerAuthority = this.txnCreateConfiguredDelegate(
            tcx2,
            "ownerAuthority",
            {
                strategyName: "address",
                // !!! TODO: look into why this 'config' entry shows up as type Partial<any>
                config: {
                    addrHint: [myCollabRoleInfo.utxo.origOutput.address],
                },
            }
        );
        const createEntry: BookEntryCreate = {
            id: tcx2.state.uuts.entryId.name,
            ownerAuthority,
            entry: entry,
        };
        //  - combine the delegate-link with the entry, to package it for on-chain storage
        //  - send the entry's UUT to the contract, with the right on-chain datum
        const tcx3 = await this.txnReceiveBookEntry(tcx2, createEntry);
        console.log(
            "   -- after receiveBookEntry:",
            dumpAny(tcx3.tx, this.networkParams)
        );

        const tenMinutes = 1000 * 60 * 10;
        tcx3.validFor(tenMinutes);

        // debugger;
        return tcx3;
    }

    async txnAddParentRefUtxo<TCX extends StellarTxnContext>(
        tcx: TCX,
        parentId: string
    ): Promise<TCX> {
        const foundParentRec = await this.mustFindMyUtxo(
            `record ${parentId}`,
            this.mkTokenPredicate(this.mph, parentId)
        );
        return tcx.addRefInput(foundParentRec);
    }

    async mkEntryIndex(entries: BookEntryForUpdate[]): Promise<BookIndex> {
        const entryIndex: Record<string, BookIndexEntry> = {};
        const changesById: Record<string, BookEntryForUpdate[]> = {};
        for (const e of entries) {
            if (e.entry.entryType == "sug") {
                const changes = (changesById[e.id] = changesById[e.id] || []);
                changes.push(e);
            } else {
                entryIndex[e.id] = {
                    pageEntry: e,
                    changes: [],
                };
            }
        }
        type txidString = string;
        const previousEntries: Record<txidString, BookEntryForUpdate> = {};
        for (const [eid, { pageEntry: entry, changes }] of Object.entries(
            entryIndex
        )) {
            for (const change of changesById[eid]) {
                if (
                    change.entry.changeParentTxId.eq(entry.utxo.outputId.txId)
                ) {
                    changes.push({
                        change,
                        isCurrent: true,
                    });
                } else {
                    const prevTx = change.entry.changeParentTxId;
                    const utxo = await this.network.getUtxo(
                        new helios.TxOutputId(
                            prevTx,
                            change.entry.changeParentOidx
                        )
                    );
                    let prevEntry = previousEntries[prevTx.hex];
                    if (!prevEntry) {
                        const prevDatum = await this.readBookEntry(utxo);
                        prevEntry = previousEntries[prevTx.hex] = prevDatum;
                    }

                    changes.push({
                        change,
                        isCurrent: false,
                        baseEntry: prevEntry,
                    });
                }
            }
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
    ): Promise<RoleInfo | undefined> {
        const collabInfo = await this.findUserRoleInfo("collab");

        if (!this.userHasOwnership(entryForUpdate, collabInfo))
            return undefined;
        return collabInfo;
    }

    userHasOwnership(
        entryForUpdate: BookEntryForUpdate, // !!! or a more generic type
        collabInfo: RoleInfo
    ) {
        const { ownerAuthority } = entryForUpdate;

        const {
            uut: { name: userCollabTokenName },
        } = collabInfo;
        const { uutName: ownerUutName } = ownerAuthority;

        const hasOwnership = !!(userCollabTokenName == ownerUutName);
        console.log("     🐞 hasOwnership?: ", {
            userCollabTokenName,
            ownerUutName,
            hasOwnership,
        });
        return hasOwnership;
    }

    async txnAddOwnershipToken<TCX extends StellarTxnContext>(
        tcx: TCX,
        entryForUpdate: BookEntryForUpdate // !!! or a more generic type
    ) {
        const ownerDelegate = await this.getOwnerDelegate(entryForUpdate);

        return ownerDelegate.txnGrantAuthority(tcx);
    }

    /**
     * Updates a book entry's utxo with new details
     * @remarks
     *
     * detailed remarks
     * @param entryForUpdate - update details
     * @reqt updates all the details found in the `entryForUpdate`
     * @reqt fails if the owner's collaborator-token (or charter authz) is not found in the user's wallet
     * @public
     **/
    @txn
    async mkTxnUpdatingEntry(
        entryForUpdate: BookEntryForUpdate,
        activity = this.activityUpdatingEntry(),
        tcx = new StellarTxnContext(this.myActor)
    ) {
        const {
            // id,
            utxo: currentEntryUtxo,
            ownerAuthority,
            entry: entry,
            updated,
        } = entryForUpdate;

        const tenMinutes = 1000 * 60 * 10;

        // get the user's ownership role for the page, if found
        const ownerCollabInfo = await this.findOwnershipRoleInfo(
            entryForUpdate
        );
        console.log("   🐞 ownership info: ", ownerCollabInfo);

        const editorInfo = await this.findUserRoleInfo("capoGov");
        //! identifies ownership ONLY if current user holds the correct authority token
        const isEditor = !!editorInfo?.uut;

        if (ownerCollabInfo) {
            const tcx1 = await this.txnAddUserCollabRole(tcx, ownerCollabInfo);
            console.log("   🐞 book entry update, with ownership");
            const tcx2 = tcx1
                .attachScript(this.compiledScript)
                .addInput(currentEntryUtxo, activity)
                .validFor(tenMinutes);

            return this.txnReceiveBookEntry(tcx2, entryForUpdate);
        } else if (isEditor) {
            const tcx1 = await this.txnAddGovAuthorityTokenRef(tcx);
            console.log(
                "   🐞 book entry update as editor",
                dumpAny(tcx1, this.networkParams)
            );

            // const tcx1a = await this.txnAddGovAuthority(tcx1);
            // console.log("   🐞 added govAuthority", dumpAny(tcx1a));
            const collabInfo = await this.findUserRoleInfo("collab");

            const tcx2 = await this.txnAddUserCollabRole(tcx1, collabInfo);
            console.log(
                "   🐞 added editor collab role",
                dumpAny(tcx2, this.networkParams)
            );

            const tcx3 = tcx2
                .attachScript(this.compiledScript)
                .addInput(currentEntryUtxo, this.activityUpdatingEntry())
                .validFor(tenMinutes);

            return this.txnReceiveBookEntry(tcx3, entryForUpdate);
        }
        throw new Error(
            "The connected wallet doesn't have the needed editor/collaborator authority to update an entry"
        );
    }

    async txnAddUserCollabRole<TCX extends StellarTxnContext>(
        tcx: TCX,
        userCollabToken: RoleInfo
    ) {
        const tcx2 = await this.txnAddUserToken(tcx, userCollabToken);

        return tcx2.addUut(userCollabToken.uut, "ownerAuthority", "collab");
    }

    async txnAddUserToken<TCX extends StellarTxnContext>(
        tcx: TCX,
        roleToken: RoleInfo
    ): Promise<TCX> {
        const t: TxInputType = roleToken?.utxo;
        if (!t)
            throw new Error(
                `addUserCollabRole: no collaborator token provided`
            );

        return tcx.addInput(roleToken.utxo).addOutput(t.output);
    }

    async mkTxnSuggestingUpdate(entryForUpdate: BookEntryForUpdate) {
        //! creates a new record with entryType="sug"
        const collabInfo = await this.findUserRoleInfo("collab");
        if (!collabInfo) {
            throw new Error(`user doesn't have a collab-* token`);
        }
        //! diffs the entries
        const { entry, updated, id } = entryForUpdate;

        let { title: titleBefore, content: contentBefore } = entry;
        let { title: newTitle, content: newContent } = updated;

        const outputId = entryForUpdate.utxo.outputId;
        const diffUpdate: BookEntryCreationAttrs = {
            content: "",
            entryType: "sug",
            title: "",
            changeParentEid: id,
            changeParentTxId: outputId.txId,
            changeParentOidx: outputId.utxoIdx,
        };
        if (titleBefore != newTitle) {
            //xxx diffChars(...)
            //! not storing diff of title, as encoding even the character-diff would not clearly be a savings,
            //  ... and it would come a need for non-trivial code to support an encoding that would save.
            //UI can perform and present an in-memory diff.
            diffUpdate.title = newTitle;
        }

        if (!newContent.endsWith("\n")) newContent = newContent + "\n";
        if (!contentBefore.endsWith("\n")) contentBefore = contentBefore + "\n";
        if (contentBefore != newContent) {
            // const charDiff = diffChars(contentBefore, newContent);
            // const lineDiff = diffLines(contentBefore, newContent);
            // const sentenceDiff = diffSentences(contentBefore, newContent);

            const options = { context: 1, newlineIsToken: true };
            const p = createPatch(
                "",
                contentBefore,
                newContent,
                "",
                "",
                options
            );
            //! trims unnecessary header content from textual patch
            const p2 = p.split("\n").splice(4).join("\n");

            // const sp = structuredPatch(id, id, contentBefore, newContent, "", "", options);
            const [pp] = parsePatch(p2); // works fine; VERY similar to result of structuredPatch
            const patched = applyPatch(contentBefore, p2);
            if (!patched) {
                console.error({ contentBefore });
                console.error({ patch: p2 });
                console.error({ pp });
                console.error({ newContent });
                throw new Error(`patch reported a conflict`);
            }

            if (patched != newContent) {
                debugger;
                console.error("patched: ", patched);
                console.error("newContent: ", newContent);
                throw new Error(`patch doesn't produce expected result`);
            }

            debugger;
            diffUpdate.content = p2;
        }

        return this.mkTxnCreatingBookEntry(diffUpdate);
    }

    async mkTxnAcceptingPageChanges(
        page: BookEntryForUpdate,
        suggestions: BookEntryForUpdate[],
        merged: { content?: string; title?: string } = {}
    ) {
        const { 
            entry: pageEntry,
            id: pageEid,
         } = page;
        const { title: pageTitle, content: pageContent } = pageEntry;

        const mergedContent = merged?.content;
        const mergedTitle = merged?.title;

        let autoMergedContent = pageContent;
        let autoMergedTitle = "";

        let suggestionIds: string[] = [];
        for (const suggestion of suggestions) {
            const { entry: suggestionEntry } = suggestion;
            const { changeParentEid, changeParentOidx, changeParentTxId } =
                suggestionEntry;
            const { title: patchTitle, content: patchContent } =
                suggestionEntry;

            suggestionIds.push(suggestion.id);

            if (page.id != changeParentEid) {
                throw new Error(
                    `suggestion ${suggestion.id} (for page ${changeParentEid}) doesn't apply to this page ${page.id}`
                );
            }

            // tries to apply all the patches, unless pre-merged content is provided
            if (!mergedContent) {
                // throws exception if patch doesn't apply cleanly
                const patched = applyPatch(autoMergedContent, patchContent);
                if (!patched)
                    throw new Error(
                        `suggestion ${suggestion.id} doesn't apply cleanly to page ${page.id}`
                    );
                autoMergedContent = patched;
            }

            if (patchTitle && !merged.title) {
                if (autoMergedTitle)
                    throw new Error(
                        `multiple patches modify title; multi-merge must provide merged.title to mkTxnAcceptingSuggestions`
                    );
                autoMergedTitle = patchTitle;
            }
        }

        const tcx = await this.mkTxnUpdatingEntry(
            {
                ...page,
                updated: {
                    ...pageEntry,
                    title: merged.title || autoMergedTitle || pageTitle,
                    content: merged.content || autoMergedContent || pageContent,
                    appliedChanges: suggestionIds,
                },
            },
            this.activityAcceptingChanges()
        );
        const burningSuggestions: UutName[] = [];
        let tcx2 = tcx as typeof tcx & isBurningSuggestions;
        tcx2.state.burningSuggestions = burningSuggestions;

        for (const suggestionId of suggestionIds) {
            tcx2 = await this.txnAcceptingOneSuggestion(tcx2, suggestionId);
        }

        return this.txnBurnAcceptedSuggestions(tcx, pageEid, burningSuggestions);
    }
    
    @partialTxn
    async txnAcceptingOneSuggestion<
        TCX extends StellarTxnContext & isBurningSuggestions
    >(tcx: TCX, suggestionId: string) {
        const utxo = await this.mustFindMyUtxo(
            `suggestion ${suggestionId}`,
            this.mkTokenPredicate(this.mph, suggestionId)
        );
        // tcx.attachScript(this.compiledScript).
        tcx.addInput(utxo, this.activitySuggestionBeingAccepted());
        tcx.state.burningSuggestions.push(new UutName("eid", suggestionId));
        return tcx
    }

    async txnBurnAcceptedSuggestions<TCX extends StellarTxnContext>(
        tcx: TCX,
        pageEid: string,
        uuts: UutName[]
    ): Promise<TCX> {
        const minter = this.connectMinter();
        const vEntries = uuts.map((uut) => mkValuesEntry(uut.name, -1n));
        const mintDgt = await this.getMintDelegate();
        return minter.txnMintWithDelegateAuthorizing(
            tcx,
            vEntries,
            mintDgt,
            mintDgt.burnSuggestionsBeingAccepted(pageEid)
        );
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
    async txnReceiveBookEntry<TCX extends StellarTxnContext>(
        tcx: TCX,
        entry: BookEntryForUpdate | BookEntryCreate
    ) {
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

        const eid = new UutName("eid", entry.id);

        return tcx
            .addState("newEntry", await this.readBookEntry(txin))
            .addUut(eid, "entryId", "eid")
            .addOutput(utxo);
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
     * @param entryId - the UUT identifier eid-xxxxxxxxxx
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

    async getMintDelegate() {
        return (await super.getMintDelegate()) as CMDBMintDelegate;
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
        const tcx = await this.addSeedUtxo(new StellarTxnContext(this.myActor));

        const mintDelegate = await this.getMintDelegate();
        debugger;
        const tcx2 = await this.txnMintingUuts(tcx, ["collab"], {
            mintDelegateActivity: mintDelegate.activityMintingCollaboratorToken(
                tcx.getSeedAttrs()
            ),
        });
        return tcx2.addOutput(
            new helios.TxOutput(
                addr,
                this.mkMinTv(this.mph, tcx2.state.uuts.collab)
            )
        );
    }

    requirements() {
        // note that these requirements augment the essential capabilities
        // ... and requirements of the base Capo class.  In particular,
        // ... the governance token 'capoGov-XXXXX' is held by the book's editor
        return hasReqts({
            "creates a registry of pages": {
                purpose:
                    "enables finding and presenting lists of the book's content",
                details: [
                    "Provides API endpoints for listing current pages in the book.",
                    "Normally, only pages that are up-to-date are included, but expired pages can also be found.",
                    "Provides endpoints for finding Suggested pages.",
                    "Provides endpoints for finding changes being proposed to any page or suggested page.",
                ],
                mech: [],
                requires: [
                    "the book's editor can create pages in the book",
                    "lists pages that are in the book",
                    "page expiration and freshening",
                    "collaborator tokens can be minted by the book's editor",
                    "collaborators can suggest pages to be added in the book",
                    "editor and page-owners can apply changes directly",
                    "collaborators can suggest changes to an existing book page",
                ],
            },

            "the book's editor can create pages in the book": {
                purpose: "clear authority for now, extensibility for later",
                details: [
                    "The book's authority token is issued to a wallet for now,",
                    "  ... and later, can be decentralized further",
                    "The holder of that capoGov-XXX authority token is called the editor here.",
                ],
                mech: [
                    "the editor can directly create book pages, with entryType=pg",
                    "an editor's created pages are owned by their collaborator role, not the capoGov- token",
                ],
            },

            "collaborator tokens can be minted by the book's editor": {
                purpose:
                    "creates positive control for who can be a collaborator",
                details: [
                    "The book's operations staff can approve the minting of collaborator tokens.",
                    "These tokens give the holder permission to suggest new pages or changes to existing pages",
                ],
                mech: [
                    "issues collab-* UUTs to any address on authority of the editor",
                ],
            },

            "lists pages that are in the book": {
                purpose: "to access book contents for presentation",
                details: [
                    "Listed pages may be already created or suggested, and may be active or expired",
                    "Expired pages are hidden by default, but can be listed explicitly",
                    "Suggested pages are listed separately from active pages",
                    "findBookEntries() is used for all of these",
                ],
                mech: [
                    "finds active entries when used with no arguments",
                    "todo: includes expired entries when used with expired:true",
                    "todo: includes suggested entries when used with suggested:true",
                    "todo: doesn't include suggested edits to pages at the top level",
                    "todo: each record includes any suggested changes that are pending",
                ],
            },

            "editor and page-owners can apply changes directly": {
                purpose: "spreads responsibility for page maintenance",
                details: [
                    "Each page can have an owner, who can apply changes to that page. ",
                    "This allows a responsible party to skip unnecessary beaurocracy",
                ],
                mech: [
                    "editor can upgrade a suggested page to type=pg",
                    "editor can make changes to another collaborator's page",
                    "editor can make changes to a suggested page without changing its type",
                    "a random collaborator can't apply changes directly to a page",
                    "a page owner can directly apply changes to their owned page",
                    "the owner of a SUGGESTED page can directly apply updates",
                    "TODO: the appliedChanges field should be emptied",
                ],
            },

            "collaborators can suggest pages to be added in the book": {
                purpose: "testnet: enable collaboration for invitees",
                details: [
                    "People can post page suggestions into the book once they have a collaborator token",
                    "Each book is operated by people who can exercise oversight authority over their books",
                ],
                mech: [
                    "a collaborator can only create a SUGGESTED  page, with entryType='spg'",
                    "the suggestor's collaborator token is referenced as the SUGGESTED page's ownerAuthority",
                ],
                requires: [
                    "collaborator tokens can be minted by the book's editor",
                ],
            },

            "collaborators can suggest changes to an existing book page": {
                purpose: "enable collaboration for invitees",
                details: [
                    "People can post page suggestions into the book once they have a collaborator token",
                    "Each book is operated by people who can exercise oversight authority over their books",
                ],
                mech: [
                    "a collaborator token is required to suggest changes",
                    "a collaborator can suggest page changes, with entryType='sug' for Suggestion",
                    "the suggestor's collaborator token is referenced as the Change record's ownerAuthority",
                    "an editor's suggestions are owned by their collaborator role",
                    "TODO: the suggestor can adjust the Change record before it is accepted",
                    "TODO: other collaborators can suggest alternatives to a change suggestion",
                ],
                requires: [
                    "collaborator tokens can be minted by the book's editor",
                    "editors and page-owners can accept changes",
                    "editors and page-owners can reject changes",
                    "well specified data format for change suggestions",
                ],
            },

            "editors and page-owners can accept changes": {
                purpose: "enables multiple parties to collaborate on a book",
                details: [
                    "Page owners and editors can apply suggested changes.",
                    "When a change is in conflict, the person applying the change ",
                    "  ... can  resolve the conflict manually and through visual inspection. ",
                    "When a change is accepted, the change record is removed, ",
                    "  ... its eid-* UUT is burned, ",
                    "  ... and is referenced in the page record's appliedChanges field",
                ],
                requires: ["application-layer conflict management"],
                mech: [
                    "TODO: editor can accept a suggested change",
                    "TODO: page owner can accept a suggested change",
                    "TODO: a random collaborator can't accept a suggested change",
                    "TODO: when accepted, the change originator receives the suggestion's minUtxo",
                    "TODO: when accepted, the suggestion's eid-* UUT is burned.",
                ],
            },

            "application-layer conflict management": {
                purpose:
                    "So that people can easily avoid merging suggestions that have become obsolete",
                details: [
                    "On-chain logic can't be expected to validate diffs. ",
                    "However, the application layer can validate that diffs can be applied cleanly. ",
                    "The dAPI provides simple conflict signals to the application layer",
                    "The application layer requires the person who merges a conflicting change to review the results.",
                ],
                mech: [
                    "TODO: A diff that conflicts is clearly marked as conflicting in the dAPI's findBookEntries() result",
                    "TODO: A diff that applies cleanly can be merged using only the details in findBookEntries()",
                    "TODO: A diff that conflicts can only be applied with a mergeResolution field providing a non-conflicting diff",
                    "TODO: Two diffs, applied in a different areas of a page, can both be merged without extra confirmation",
                ],
            },

            "well specified data format for change suggestions": {
                purpose:
                    "enables interoperability of change suggestions either with our dAPI or without",
                details: [
                    "Each change suggestion references the utxo of the page being changed. ",
                    "When the parent utxo is still most current, then the change can always be applied, ",
                    "  ... otherwise, patch conflict resolution may be needed.",
                    "Content changes are formatted as a diff.",
                    "Title changes are reflected without a diff format.",
                ],
                mech: [
                    "references the parent transaction-id",
                    "formats title as direct change, leaving content empty if unchanged",
                    "formats content changes as a diff, leaving title empty if unchanged",
                ],
            },

            "editors and page-owners can reject changes": {
                purpose: "to clean up after changes that are not accepted",
                details: [
                    "A change record contains a eid- UUT, which is burned when the change is rejected.",
                    "This prevents the rejected change from being applied later.",
                    "The chain record can be queried to see rejected changes (not currently in scope).",
                    "Any minUtxo connected to the rejected change has to be paid out, and ",
                    "  ... we are not paying it to the originator of the bad suggestion, to incentivize good suggestions.",
                ],
                mech: [
                    "TODO: a random collaborator can't reject a suggested change",
                    "TODO: editor can reject a suggested change",
                    "TODO: page owner can reject a suggested change",
                    "TODO: when a change is rejected, its eid-* UUT is burned.",
                ],
            },

            "page expiration and freshening": {
                purpose:
                    "for proactive freshness even in the face of immutable content",
                details: [
                    "Book pages expire by default, and can be freshened as long as they remain relevant.",
                    "This way, obsolete content is naturally hidden, ",
                    "  ... while remaining available for review/update/freshening",
                    "listBookEntries() includes these requirements",
                    "When a listing is freshened, its expiration date is extended.",
                ],
                mech: [
                    "TODO: A listing can be freshened by its owner or editor, and its expiration date is extended",
                    "FUT: expired pages can be freshened implicitly by a collaborator suggesting a fresh change that resolves any obsolescence",
                ],
            },

            "page deletion": {
                purpose:
                    "for proactive assurance of freshness and quality of each page and the book overall",
                details: [
                    "The book's editor can revoke a listing.",
                    "A revoked listing MUST NOT be considered an active page in the book.",
                ],
                mech: [
                    "TODO: editor can delete a page",
                    "TODO: page owner can delete a page",
                    "TODO: collaborator can't delete a page",
                ],
                requires: [
                    // "FUT: A virtual deletion can be developed by momentum of collaborators"
                ],
            },
        });
    }
}
