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
            "people can post credentials to be listed in the creds Registry": {
                purpose:
                    "testnet: create a project-based learning zone for credentials and a useful creds registry",
                details: [
                    "People can post credentials into the registry ",
                    "  ... to share information about the credentials they have ",
                    "  ... or that they would like to offer.",
                    "Provides directory of verifiable credentials and their issuers ",
                    "  ... for use by Web 3 communities in Cardano and beyond.",
                    "People can use the directory to understand what credentials mean",
                    "  ... and how to acquire and verify them",
                    "The registry is operated by people who can exercise oversight authority over the registry",
                ],
                mech: ["per nested requirements"],
                requires: [
                    "allows anyone to post information about a credential, for listing in the registry",
                    "creates validated credential listings",
                    "enforces an automatic expiration for every listing",
                    "issues a linked authority token for the creator's wallet",
                    "a listing can be freshened by the holder of the linked authority token",
                    "the registry's trustee group can govern listed credentials",
                ],
            },
            "allows anyone to post information about a credential, for listing in the registry":
                {
                    purpose: "Enables openness",
                    details: [
                        "People are expected to use a web UI for filling out details.",
                        "The UI code should mkTxnCreatingRegisteredCredential() with the details.",
                        "The Create transaction makes an identifiable UTxO in the contract for the listing, ",
                        "  ... and sends an NFT-like token to the user's wallet for positive linkage with the listing.",
                    ],
                    mech: [
                        "The person who posts the credential is the default trustee for that credential's policy-delegate",
                        "Creates a RegisteredCredential datum in the contract, with a rcred-xxxxx UUT",
                    ],
                    requires: [
                        "creates validated credential listings",
                        "issues a linked authority token for the creator's wallet",
                    ],
                },

            "creates validated credential listings": {
                purpose:
                    "Provides baseline assurance of having key details for a listing",
                details: [
                    "Required fields must be filled, for a listing to be valid",
                    "Other validations may also be enforced",
                    "Validation problems in mkTxnCreatingRegistryEntry() should be made visible to the UI layer",
                    "It should be possible for people to experiment with credential listings even if they do not yet have an issuing service or dID",
                ],
                mech: [
                    "type, name, issuer name, and description are required as essential information about the credential",
                    "at least one Expectation for the subject of a credential must be specified",
                    "other fields are optional, to support experimentation",
                ],
                requires: [],
            },

            "issues a linked authority token for the creator's wallet": {
                purpose:
                    "to enable a person to easily connect in the future with their listings",
                details: [
                    "Each created listing also issues an NFT-like token, sent to the creator's wallet",
                    "The minted metadata can contain or reference HTML/Javascript to show in-wallet details",
                    "That token can be re-minted later, to update its metadata as needed",
                    "Additional mints of the same token can be issued to other trustees on that listing,",
                    "  ... or for interested people to use like a bookmark for that listing",
                ],
                mech: [
                    "uses a token name 'link:regCred-xyz' linked to each regCred-xyz record",
                    "requires the linked authority token for updating a regCred entry",
                ],
                requires: [],
            },

            "enforces an automatic expiration for every listing": {
                purpose:
                    "provides a dead-man-switch convention to ensure freshness of displayed listings",
                details: [
                    "Issuing parties must freshen their credential listings periodically",
                    "  ... to guard against obsolete registry listings.",
                    "At that time, they may choose to freshen certain details of their listings also.",
                ],
                mech: [
                    "TEMP: expiration is 1 year",
                    "TODO: initial expiration is 90 days, and may not be modified by the creator",
                    "TODO: after 2/3 of the validity period, the validity can be extended by 1.6x, max 1y",
                    "queries for active listings SHOULD filter out past-expiry records",
                ],
                requires: [
                    "a listing can be freshened by the holder of the linked authority token",
                ],
            },

            "a listing can be revoked": {
                purpose:
                    "for proactive assurance of freshness and quality of the listing and the registry overall",
                details: [
                    "The registry's operator(s) and a listing's owner can revoke a listing.",
                    "A revoked listing MUST NOT be considered an active item in the registry.",
                ],
                mech: [
                    "A revocation is allowed by authority of the regCred's linked authority token",
                    "A revocation is allowed by authority of the registry's operators",
                ],
                requires: [
                    "the registry's trustee group can govern listed credentials",
                    "issues a linked authority token for the creator's wallet",
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
