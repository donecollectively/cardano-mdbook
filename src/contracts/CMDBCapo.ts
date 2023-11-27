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
import specializedCapo from "./specializedCCRegistry.hl"; // assert { type: 'text' };

import { CCRMintDelegate } from "./CCRMintDelegate.js";

export type RegisteredCredentialOnchain = {
    credAuthority: RelativeDelegateLink<AuthorityPolicy>;
    cred: RegisteredCredential;
};

export type RegisteredCredential = {
    credType: string;
    credName: string;
    credDesc: string;
    credIssuerDID: string;
    issuerName: string;
    expectations: string[];
    issuingGovInfo: string;
    createdAt: bigint;
    updatedAt: bigint;
    expiresAt: bigint;
    issuancePlatform: string;
    issuanceUrl: string;
};

type credId = RegisteredCredentialOnchain["credAuthority"]["uutName"];
export type RegisteredCredentialCreate = RegisteredCredentialOnchain & {
    id: credId;
};

export type RegisteredCredentialForUpdate = RegisteredCredentialOnchain & {
    id: credId;
    utxo: TxInput;
    updated?: RegisteredCredential;
};
export type RegisteredCredentialUpdated = {
    updated: RegisteredCredential;
} & RegisteredCredentialForUpdate;

export class CCRegistry extends DefaultCapo {
    get specializedCapo() {
        return mkHeliosModule(
            specializedCapo,
            "src/contracts/specializedCCRegistry.hl"
        );
    }

    static get defaultParams() {
        return {};
    }

    @Activity.redeemer
    protected activityUpdatingCredential(): isActivity {
        const { updatingCredential } = this.onChainActivitiesType;
        const t = new updatingCredential();

        return { redeemer: t._toUplcData() };
    }

    @datum
    mkDatumRegisteredCredential<
        T extends RegisteredCredentialCreate | RegisteredCredentialUpdated
    >(d: T): InlineDatum {
        //!!! todo: make it possible to type these datum helpers more strongly
        //  ... at the interface to Helios
        console.log("--> mkDatumCharter", d);
        const { RegisteredCredential: hlRegisteredCredential } =
            this.onChainDatumType;
        const { CredStruct: hlCredStruct } = this.onChainTypes;

        //@ts-expect-error can't seem to tell the the Updated alternative actually does have this attribut,
        //    ... just because the Create alternative does not...
        const rec = d.updated || (d.cred as RegisteredCredential);

        //@ts-expect-error
        if (d.updated) {
            rec.createdAt = d.cred.createdAt;
            rec.updatedAt = Date.now();
        } else {
            rec.createdAt = Date.now();
            rec.updatedAt = 0n;
        }
        rec.expiresAt = Date.now() + 364 * 24 * 60 * 60 * 1000;
        const {
            credType,
            credName,
            credDesc,
            credIssuerDID,
            issuerName,
            expectations,
            issuingGovInfo,
            issuancePlatform,
            issuanceUrl,
            createdAt,
            updatedAt,
            expiresAt,
        } = rec;

        const credAuthority = this.mkOnchainDelegateLink(d.credAuthority);
        debugger;
        const credStruct = new hlCredStruct(
            credType,
            credName,
            credDesc,
            credIssuerDID,
            issuerName,
            expectations,
            issuingGovInfo,
            issuancePlatform,
            issuanceUrl,
            new Map(),
            createdAt,
            updatedAt,
            expiresAt
        );
        const t = new hlRegisteredCredential(credAuthority, credStruct);
        debugger;
        return Datum.inline(t._toUplcData());
    }

    get delegateRoles() {
        const { mintDelegate: pMD, ...inherited } = super.delegateRoles;

        const { baseClass, uutPurpose, variants } = pMD;
        return {
            ...inherited,
            credAuthority: defineRole(
                "credListingAuthz",
                AuthorityPolicy,
                inherited.govAuthority.variants
            ),
            mintDelegate: defineRole(uutPurpose, baseClass, {
                default: {
                    delegateClass: CCRMintDelegate,
                    // partialConfig: {},
                    // validateConfig(args): strategyValidation {
                    //     return undefined
                    // },
                },
            }),
        };
    }

    /**
     * Creates a new credential listing and sends the authority/bearer token to the user's wallet
     * @remarks
     *
     * Any user can submit a credential for listing in the registry by submitting key
     * information about their credential, its meaning, and the governance process used
     * for people to receive the credential.
     * @param cred - details of the listing
     * @param iTcx - optional initial transaction context
     * @public
     **/
    @txn
    async mkTxnCreatingRegistryEntry<TCX extends StellarTxnContext<any>>(
        cred: RegisteredCredential,
        iTcx?: TCX
    ): Promise<TCX> {
        // to make a new cred entry, we must:
        //  - make a UUT for the credential listing (in-contract datum)
        //  - ... and a UUT for administrative authority on that credential
        //  -    ^^ includes the mint-delegate for authorizing creation of the credential-listing
        debugger;
        const tcx = await this.mkTxnMintingUuts(
            iTcx || new StellarTxnContext<any>(this.myActor),
            ["regCred", "credListingAuthz"],
            undefined,
            {
                regCredential: "regCred",
                credAuthority: "credListingAuthz",
            }
        );

        //  - create a delegate-link connecting the registry to the credAuth
        const credAuthority = this.txnCreateConfiguredDelegate(
            tcx,
            "credAuthority",
            {
                strategyName: "address",
                config: {
                    addrHint: await this.wallet.usedAddresses,
                },
            }
        );
        const tenMinutes = 1000 * 60 * 10;

        const authz: UutName = tcx.state.uuts.credListingAuthz;
        //  - send the credAuth UUT to the user
        const tcx2 = await credAuthority.delegate.txnReceiveAuthorityToken(
            tcx,
            this.uutsValue(authz)
        );
        tcx2.validFor(tenMinutes);

        //  - combine the delegate-link with the `cred` to package it for on-chain storage
        //  - send the cred-listing UUT to the contract, with the right on-chain datum
        const tcx3 = this.txnReceiveRegistryEntry(tcx2, {
            credAuthority,
            id: tcx.state.uuts.regCred.name,
            cred,
        });
        console.warn("after receiveReg", dumpAny(tcx3.tx));
        debugger;
        return tcx3 as TCX & typeof tcx2 & typeof tcx;
    }

    /**
     * adds the indicated credential properties to the current transaction
     * @remarks
     *
     * includes the Credential details in the datum of the output
     * @param tcx: transaction context
     * @param cred: properties of the new credential
     * @param existingUtxo: unused existing utxo
     * @public
     **/
    @partialTxn
    txnReceiveRegistryEntry<TCX extends StellarTxnContext<any>>(
        tcx: TCX,
        cred: RegisteredCredentialForUpdate | RegisteredCredentialCreate
    ): TCX {
        debugger;
        const credMinValue = this.mkMinTv(this.mph, cred.id);
        const utxo = new TxOutput(
            this.address,
            credMinValue,
            this.mkDatumRegisteredCredential(cred)
        );

        return tcx.addOutput(utxo);
    }
    // Address.fromHash(cred.credAuthority.delegateValidatorHash),

    /**
     * Finds and returns the UTxO matching the given UUT identifier
     * @remarks
     *
     * Throws an error if it is not found
     * @param credId - the UUT identifier regCred-xxxxxxxxxx
     * @public
     **/
    findRegistryUtxo(credId: string) {
        return this.mustFindMyUtxo(
            "registered cred",
            this.mkTokenPredicate(this.mph, credId),
            `not found in registry: credential with id ${credId}`
        );
    }

    /**
     * Reads the datum details for a given RegisteredCredential id
     * @remarks
     *
     * Asynchronously reads the UTxO for the given id and returns its underlying datum via {@link CCRegistry.readRegistryEntry}
     *
     * @param credId - the UUT identifier regCred-xxxxxxxxxx
     * @public
     **/
    async findRegistryEntry(credId: string) {
        const utxo = await this.findRegistryUtxo(credId);
        return this.readRegistryEntry(utxo);
    }

    /**
     * Reads the datum details for a RegisteredCredential datum from UTxO
     * @remarks
     *
     * Parses the UTxO for the given id.
     *
     * If you have a credId, you can use {@link CCRegistry.findRegistryEntry} instead.
     *
     * The resulting data structure includes the actual on-chain data
     * as well as the `id` actually found and the `utxo` parsed, for ease
     * of updates via {@link CCRegistry.mkTxnUpdatingRegistryEntry}
     *
     * @param utxo - a UTxO having a registry-entry datum, such as found with {@link CCRegistry.findRegistryUtxo}
     * @public
     **/
    async readRegistryEntry(
        utxo: TxInput
    ): Promise<RegisteredCredentialForUpdate | undefined> {
        const a = utxo.value.assets.getTokenNames(this.mph);
        const credId = a
            .map((x) => helios.bytesToText(x.bytes))
            .find((x) => x.startsWith("regCred"));

        const result = await this.readDatum<RegisteredCredentialOnchain>(
            "RegisteredCredential",
            utxo.origOutput.datum as InlineDatum
        );
        if (!result) return undefined;

        return {
            ...result,
            utxo,
            id: credId,
        };
    }

    /**
     * Instantiates and returns a delegate instance for a specific registered credential id
     * @remarks
     *
     * Resolves the delegate-link by finding the underlying utxo with findRegistryCred,
     * if that cred is not provided in the second arg
     * @param cred - an existing credential datum already parsed from utxo
     * @param credId - the UUT identifier regCred-xxxxxxxxxx
     * @public
     **/
    async getCredEntryDelegate(
        cred: RegisteredCredentialOnchain
    ): Promise<AuthorityPolicy>;
    async getCredEntryDelegate(credId: string): Promise<AuthorityPolicy>;
    async getCredEntryDelegate(
        credOrId: string | RegisteredCredentialOnchain
    ): Promise<AuthorityPolicy> {
        const cred: RegisteredCredentialOnchain =
            "string" == typeof credOrId
                ? await this.findRegistryEntry(credOrId)
                : credOrId;

        const delegate = await this.connectDelegateWithLink(
            "govAuthority",
            cred.credAuthority
        );
        return delegate;
    }

    /**
     * Updates a credential entry's utxo with new details
     * @remarks
     *
     * detailed remarks
     * @param ‹pName› - descr
     * @reqt updates all the details found in the `update`
     * @reqt fails if the `credId` is not found
     * @reqt fails if the authority UUT is not found in the user's wallet
     * @public
     **/
    @txn
    async mkTxnUpdatingRegistryEntry(
        credForUpdate: RegisteredCredentialUpdated
    ): Promise<StellarTxnContext<any>> {
        const {
            // id,
            utxo: currentUtxo,
            credAuthority,
            cred,
            updated,
        } = credForUpdate;

        const authority = await this.getCredEntryDelegate(credForUpdate);
        const tcx = await authority.txnGrantAuthority(
            new StellarTxnContext<any>()
        );

        const tenMinutes = 1000 * 60 * 10;
        const tcx2 = tcx
            .attachScript(this.compiledScript)
            .addInput(currentUtxo, this.activityUpdatingCredential())
            .validFor(tenMinutes);
        return this.txnReceiveRegistryEntry(tcx2, credForUpdate);
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
                    "The holder of the book authority token can directly create book pages",
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
                    "creates page records with type='spg' for suggested",
                    "the suggestor's collaborator token is referenced in the suggestedBy field",
                    "the suggestor can make changes to the page before it is accepted",
                ],
                requires: [
                    "contributor tokens can be minted by the book's operator",
                    "page expiration",
                    "the registry's trustee group can govern listed credentials",
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

            "the registry's trustee group can govern listed credentials": {
                purpose: "to guard for quality and against abuse",
                details: ["TODO - use Capo multisig strategy"],
                mech: [],
                requires: [],
            },
        });
    }
}
