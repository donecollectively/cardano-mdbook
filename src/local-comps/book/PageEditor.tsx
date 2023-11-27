import React, {
    createRef,
    ChangeEvent,
    ChangeEventHandler,
    Component,
} from "react";
import { createPortal } from "react-dom";
import {
    CCRegistry,
    RegisteredCredential,
    RegisteredCredentialOnchain,
    RegisteredCredentialForUpdate,
} from "../../contracts/CCRegistry.js";
import { Prose } from "../Prose.jsx";
import head from "next/head.js";
const Head = head.default;

import { TxOutput, Wallet, dumpAny } from "@donecollectively/stellar-contracts";
import { credRegistryProps } from "./sharedPropTypes.js";
import { CertsPage } from "../../pages/certifications/[...args].jsx";
import { NextRouter } from "next/router.js";
import { CredView } from "./CredView.jsx";

type stateUpdaterFunc = CertsPage["updateState"];
type propsType = {
    cred?: RegisteredCredentialForUpdate;
    create?: boolean;
    updateState: stateUpdaterFunc;
    refresh: Function;
    router: NextRouter;
    onSave: Function;
    onClose: Function;
} & credRegistryProps;

type stateType = {
    modified: boolean;
    gen: number;
    error?: string;
    submitting?: boolean;
    problems: Record<string, string>;
    current: RegisteredCredential;
};

type FieldProps = {
    rec: RegisteredCredential;
    fn: string;
    as?: React.ElementType;
    rows?: number;
    options?: string[];
    placeholder?: string;
    label: string;
    defaultValue: string;
    style?: Record<string, any>;
    tableCellStyle?: Record<string, any>;
    helpText: string;
    index?: number;
    validator?: Function;
    fieldId: string;
    problem?: string;
    onChange: ChangeHandler;
};

type ChangeHandler = React.ChangeEventHandler<HTMLInputElement>;

const testCredInfo = {
    expectations: [""],
    // first - DEMU
    // credDesc:
    //     "Certifies a person's knowledge and ability to operate DEMU's Munode and administer the delegations and other music-related activities",
    // credName: "DEMU Certified Node Operator",
    // // credSummary: "Certifies administrative and technical understanding of operating Munode",
    // credType: "skill",
    // expectations: [
    //     "has a practical understanding of general unix system administration",
    //     "can operate a nodejs-based service, including handling of version upgrades",
    //     "has learned about delegation and music-inventory mechanics of DEMU's content network",
    //     "owns a $DEMU.munodeOperator token",
    // ],
    // issuerName: "DEMU",
    // issuingGovInfo:
    //     "Candidates will attend a node-operator training program and get their Munode running on testnet.\n\nAfter they demonstrate music-inventory delegation activities, DEMU staff will issue the certificate.",
    // issuancePlatform: "ATALA Prism",

    // credName: `Sample ${new Date().toUTCString()}`,
    // credDesc: "test description",
    // credSummary: "tester",
    // credType: "testing",
    // expectations: ["none"],
    // issuerName: "nobody",
    // issuingGovInfo: "hi!",
    // credIssuerDID: "n/a",
};

const buttonStyle = {
    padding: "0.75em",
    marginLeft: "0.5em",
    minWidth: "8em",
    // marginTop: '-0.75em',
    // border: '1px solid #0000ff',
    // borderRadius: '0.25em',
    // backgroundColor: '#1e244c',

    border: "1px solid #162ed5",
    borderRadius: "0.5em",
    backgroundColor: "#142281",
};

type fieldOptions =
    | {
          array?: true;
          helpText?: string;
          length?: number;
          placeholder?: string;
          defaultValue?: string;
          rows?: number;
          style?: Record<string, any>;
          tableCellStyle?: Record<string, any>;
          validator?: Function;
          options?: string[];
          type?: "textarea" | "input" | "select";
      }
    | undefined;

let mountCount = 0;

export class CredForm extends React.Component<propsType, stateType> {
    form = createRef<HTMLFormElement>();
    i: number;
    constructor(props) {
        super(props);
        this.i = mountCount += 1;
        this.save = this.save.bind(this);
        this.form = React.createRef();
    }

    async componentDidMount() {
        const { cred, credsRegistry } = this.props;
        // console.error(`MOUNTED CredForm ${this.i}`)
        const current =
            cred?.cred ||
            ({
                ...testCredInfo,
                // expectations: ["", ""],
            } as RegisteredCredential);
        await new Promise((res) => {
            this.setState(
                {
                    current,
                    problems: {},
                },
                res as any
            );
        });
        if (this._unmounting) return;

        let tcx: any;
        try {
            const env = process.env.NODE_ENV;
            const minter = await credsRegistry.getMintDelegate();
            // tcx = await credsRegistry.mkTxnCreatingRegistryEntry(testCredInfo);
            // console.warn(dumpAny(tcx));

            // await credsRegistry.submit(tcx);
        } catch (error) {
            console.error(error.stack);
            debugger;
            this.setState({ error: error.message });
        }
    }
    _unmounting?: true;
    componentWillUnmount(): void {
        // console.error(`UNMOUNTing CredForm ${this.i}`)
        // this._unmounting = true;
    }

    render() {
        const {
            current: rec,
            modified,
            error,
            submitting,
            problems,
        } = this.state || {};
        const { cred, create, onClose, onSave, credsRegistry } = this.props;
        if (!rec) return ""; //wait for didMount
        const showTitle = <>{create && "Creating"} Credential Listing</>;
        let sidebarContent;
        const foundProblems = submitting && Object.keys(problems).length;
        {
            if ("undefined" == typeof window) {
                sidebarContent = <div suppressHydrationWarning />;
            } else {
                const portalTarget = document?.getElementById("sidebar");
                sidebarContent = (
                    <div suppressHydrationWarning>
                        {createPortal(
                            <Prose
                                className="prose-slate"
                                style={{ fontSize: "85%" }}
                            >
                                <p
                                    style={{
                                        fontStyle: "italic",
                                        marginTop: "4em",
                                    }}
                                >
                                    Your credential will be listed on our
                                    website and visible in the Cardano
                                    blockchain. We'll create a bearer token in
                                    your wallet and a registry entry in our
                                    Registry smart contract.
                                </p>
                                <p style={{ fontStyle: "italic" }}>
                                    The listing will have an expiration date,
                                    and you can update details or extend its
                                    lifetime just by coming back here, with the
                                    bearer token still in your Cardano wallet.
                                </p>
                            </Prose>,
                            portalTarget
                        )}
                    </div>
                );
            }
        }

        return (
            <div>
                <Head>
                    <title>{showTitle}</title>
                </Head>
                <header className="mb-9 space-y-1">
                    <p className="font-display text-sm font-medium text-sky-500">
                        Certifications
                    </p>
                </header>
                {sidebarContent}
                <Prose
                    className="prose-slate"
                    style={{
                        marginTop: "-2em",
                        backgroundColor: "#1e244c",
                        borderRadius: "0.5em",
                        padding: "0.75em",
                    }}
                >
                    <div style={{ float: "right", fontSize: "80%" }}>
                        {(modified && (
                            <button
                                style={buttonStyle}
                                type="button"
                                onClick={onClose as any}
                            >
                                Cancel
                            </button>
                        )) || (
                            <button
                                style={buttonStyle}
                                type="button"
                                onClick={onClose as any}
                            >
                                {create ? "Cancel" : "Back"}
                            </button>
                        )}
                    </div>
                    <h1
                        className="font-display text-3xl tracking-tight text-slate-900 dark:text-white"
                        style={{
                            marginBottom: "0",
                        }}
                    >
                        {showTitle}
                    </h1>
                    <form
                        ref={this.form}
                        onSubmit={this.save}
                        style={{
                            padding: "0.75em",
                            fontSize: "85%",
                        }}
                    >
                        <table>
                            <tbody>
                                {this.field("Credential Type", "credType", {
                                    type: "select",
                                    options: [
                                        "person",
                                        "skill",
                                        "experience",
                                        "training cert",
                                        "aptitude",
                                        "other",
                                    ],
                                    tableCellStyle: {
                                        padding: "0.25em",
                                        // backgroundColor: "#142281e7"
                                    },
                                    style: {
                                        backgroundColor: "#142281e7",
                                    },
                                })}
                                {this.field("Credential Name", "credName", {
                                    placeholder: "Short onscreen label",
                                    validator(v) {
                                        if (v.length < 10)
                                            return "must be at least 10 characters";
                                    },
                                })}
                                {this.field("Description", "credDesc", {
                                    type: "textarea",
                                    rows: 3,
                                    validator(v) {
                                        if (v.length < 40)
                                            return "must be at least 40 characters";
                                    },
                                })}
                                {this.field("Issuer Name", "issuerName", {
                                    validator(v) {
                                        if (v.length < 4) return "too short";
                                    },
                                })}
                                {this.field("Issuing Entity DID", "credDID", {
                                    placeholder: "e.g. did:prism: ...",
                                })}
                                {this.field(
                                    "Issuance Platform",
                                    "issuancePlatform",
                                    {
                                        type: "select",
                                        options: ["ATALA Prism", "other"],
                                        tableCellStyle: {
                                            padding: "0.25em",
                                            // backgroundColor: "#142281e7"
                                        },
                                        style: {
                                            backgroundColor: "#142281e7",
                                        },
                                    }
                                )}
                                {this.field(
                                    "Issuance URL (optional)",
                                    "issuanceUrl",
                                    {}
                                )}

                                {this.field("Expectations", "expectations", {
                                    helpText:
                                        "credential holders will have demonstrated these skills, capabilities, or evidence",
                                    array: true,
                                    validator(v, rec, arrayIndex) {
                                        if (arrayIndex && !v.length) return; //non-first item can be empty
                                        if (v.length < 10) return "too short";
                                    },
                                    length: rec.expectations?.length,
                                })}
                                {this.field(
                                    "Governance Details",
                                    "issuingGovInfo",
                                    {
                                        type: "textarea",
                                        rows: 8,
                                        helpText:
                                            "describe how you govern the issuance of this credential",
                                        validator(v) {
                                            if (v.length < 100)
                                                return "Please provide more detail (at least 100 characters)";
                                        },
                                    }
                                )}
                                <tr>
                                    <th></th>
                                </tr>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td></td>
                                    <td>
                                        {modified && (
                                            <>
                                                <button
                                                    style={buttonStyle}
                                                    type="submit"
                                                >
                                                    {create
                                                        ? "Create"
                                                        : "Save Changes"}
                                                </button>
                                                <div className="ml-4">
                                                    {!!foundProblems && (
                                                        <div className="text-[#f66]">
                                                            Please fix{" "}
                                                            {foundProblems}{" "}
                                                            problem()s before
                                                            proceeding
                                                            <br />
                                                        </div>
                                                    )}

                                                    <div>See preview below</div>
                                                </div>
                                            </>
                                        )}
                                    </td>
                                </tr>
                                {error && (
                                    <tr>
                                        <td></td>
                                        <td>
                                            <div
                                                className="error border rounded relative mb-4"
                                                role="alert"
                                                style={{
                                                    marginBottom: "0.75em",
                                                }}
                                            >
                                                <strong className="font-bold">
                                                    Whoops! &nbsp;&nbsp;
                                                </strong>
                                                <span className="block inline">
                                                    {error}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tfoot>
                        </table>
                    </form>
                    {modified && (
                        <>
                            <h3
                                id="preview"
                                className="mt-0 mb-2 text-slate-700"
                            >
                                Preview
                            </h3>
                            <hr className="not-prose mb-2" />
                            <CredView
                                {...{
                                    cred: { ...cred, cred: rec },
                                    credsRegistry,
                                }}
                                preview
                            />
                        </>
                    )}
                </Prose>
            </div>
        );
    }

    field(label: string, fn: string, options?: fieldOptions) {
        const { current: rec, problems, submitting } = this.state;
        const { 
            array, type: as = 'input',  
            options: selectOptions,
            style,
            validator,            
            tableCellStyle,
            rows, helpText, placeholder, defaultValue, 
        } = options || {}; //prettier-ignore

        if (!array) {
            const fieldId = this.mkFieldId(fn);
            captureProblems.call(this, fieldId, rec[fn]);

            const showProblem = submitting
                ? { problem: problems[fieldId] }
                : {};
            return (
                <Field
                    key={fn}
                    {...showProblem}
                    {...{
                        rec,
                        as,
                        fn,
                        fieldId,
                        label,
                        placeholder,
                        defaultValue,
                        helpText,
                        options: selectOptions,
                        rows,
                        style,
                        tableCellStyle,
                        onChange: validator
                            ? this.mkChangeValidator(fieldId, validator, rec)
                            : this.changed,
                    }}
                />
            );
        }
        const items = rec[fn];
        if (!!items.at(-1)) {
            items.push("");
        }

        return (
            <>
                {items.map((oneValue, index) => {
                    const fieldId = this.mkFieldId(fn, index);
                    debugger;
                    captureProblems.call(this, fieldId, rec[fn][index], index);

                    const showProblem = submitting
                        ? { problem: problems[fieldId] }
                        : {};
                    return (
                        <Field
                            key={fieldId}
                            {...showProblem}
                            {...{
                                rec,
                                as,
                                fn,
                                index,
                                fieldId,
                                label,
                                placeholder,
                                defaultValue,
                                helpText,
                                rows,
                                style,
                                tableCellStyle,
                                onChange: validator
                                    ? this.mkChangeValidator(fieldId, validator, rec, index)
                                    : this.changed,
                            }}
                        />
                    );
                })}
            </>
        );

        function captureProblems(fieldId: string, rVal, fieldIndex) {
            if (validator) {
                const problem = validator(rVal || "", rec, fieldIndex);
                if (problem && !problems[fieldId]) {
                    this.setStateLater(({ problems }) => ({
                        problems: {
                            ...problems,
                            [fieldId]: problem,
                        },
                    }));
                }
            }
        }
    }
    setStateLater(...args) {
        setTimeout(() => {
            //@ts-expect-error
            this.setState(...args);
        }, 1);
    }

    validators: Record<string, ChangeHandler> = {};
    mkChangeValidator(fieldId: string, validate: Function, rec : RegisteredCredential, index? : number): ChangeHandler {
        const v = this.validators[fieldId];
        if (v) return v;
        const changedWithValidation: ChangeHandler = (e) => {
            if (validate) {
                debugger;
                const value = e.target.value;
                const problem = validate(value, rec, index);
                if (this.state.problems[fieldId] !== problem) {
                    this.setStateLater(({ problems }) => {
                        const newState = {
                            //! clears problems that have been corrected (i.e. [key] => ‹undefined›)
                            //   ... using json-stringifying convention of skipping undef values
                            problems: JSON.parse(JSON.stringify({
                                ...problems,
                                [fieldId]: problem,
                            }))
                        };
                        debugger;
                        return newState;
                    });
                }
            }
            return this.changed(e);
        };
        return (this.validators[fieldId] = changedWithValidation);
    }

    changed: ChangeHandler = (e) => {
        //! adds an empty item at the end of the list of expectations
        const {
            current: { expectations },
            gen = 0,
        } = this.state;

        const f = this.form.current;
        const updatedCred = this.capture(f);
        if (updatedCred.expectations.at(-1)) updatedCred.expectations.push("");

        this.setState({
            current: updatedCred,
            modified: true,
            gen: 1 + gen,
        });
    };
    capture(form) {
        const formData = new FormData(form);
        const updatedCred: RegisteredCredential = Object.fromEntries(
            formData.entries()
        ) as unknown as RegisteredCredential;
        const exp = formData.getAll("expectations") as string[];

        updatedCred.expectations = exp;
        return updatedCred;
    }

    async save(e: React.SyntheticEvent) {
        const { current: rec } = this.state;
        const {
            cred: credForUpdate,
            refresh,
            updateState,
            credsRegistry,
            router,
            create,
            wallet,
        } = this.props;
        e.preventDefault();
        e.stopPropagation();

        //! clears "undefined" problems that may have existed temporarily
        const problems = JSON.parse(JSON.stringify(this.state.problems));
        if (Object.keys(problems).length) {
            this.setState({ problems, submitting: true });
            return;
        }

        const form = e.target as HTMLFormElement;
        const updatedCred = this.capture(form);

        while (!updatedCred.expectations.at(-1)) updatedCred.expectations.pop();

        try {
            const txnDescription = `${create ? "creation" : "update"} txn`;
            updateState(`preparing ${txnDescription}`, { progressBar: true });
            const tcx = create
                ? await credsRegistry.mkTxnCreatingRegistryEntry(updatedCred)
                : await credsRegistry.mkTxnUpdatingRegistryEntry({
                      ...credForUpdate,
                      updated: updatedCred,
                  });
            console.warn(dumpAny(tcx));
            updateState(
                `sending the ${txnDescription} to your wallet for approval`,
                {
                    progressBar: true,
                }
            );
            const minDelay = new Promise((res) => setTimeout(res, 2000));

            await credsRegistry.submit(tcx);
            await minDelay;
            updateState(`submitting the ${txnDescription} to the network`);
            refresh().then(async () => {
                updateState(
                    `The update will take a few moments before it's confirmed`
                );
                await new Promise((res) => setTimeout(res, 3000));
                updateState("");
            });
            router.push("/certifications");
            // this.setState({modified: true})
        } catch (error) {
            console.error(error.stack);
            debugger;
            updateState(error.message, { error: true });
        }
    }
    mkFieldId(fn: string, index?: number): string {
        const idx = index || (index === 0 ? 0 : "");
        return `${fn}.${index || ""}`;
    }
}

function Field({
    rec,
    fn,
    as: As = "input",
    helpText,
    index,
    placeholder,
    defaultValue,
    rows,
    options,
    label,
    style,
    tableCellStyle,
    fieldId,
    validator,
    problem,
    onChange,
}: FieldProps) {
    const rVal = rec[fn];
    let value = rVal;

    if ("undefined" !== typeof index)
        value = rec[fn][index] || (rec[fn][index] = "");

    const isOnlyOrLastRow = !Array.isArray(rVal) || index + 1 == rVal.length;
    const noBottomBorder = {
        style: { borderBottom: "none" },
    };
    const arrayTableStyle = isOnlyOrLastRow ? {} : noBottomBorder;
    const helpId = fn;
    const errorId = problem ? `problem-${fieldId}` : "";
    const renderedOptions = options
        ? options.map((s) => {
              const selected = value == s ? { selected: true } : {};
              return (
                  <option key={s} value={s} {...selected}>
                      {s}
                  </option>
              );
          })
        : undefined;
    const errorBorder = problem ? { border: "1px solid #f66" } : {};
    return (
        <tr {...arrayTableStyle}>
            <th>{!!index || <label htmlFor={fieldId}> {label}</label>}</th>
            <td style={tableCellStyle || {}}>
                <As
                    autoComplete="off"
                    className="invalid:border-pink-500"
                    style={{
                        width: "100%",
                        color: "#ccc",
                        fontWeight: "bold",
                        padding: "0.4em",
                        background: "#000",
                        ...errorBorder,
                        ...style,
                    }}
                    id={fieldId}
                    aria-invalid={errorId ? true : false}
                    aria-describedby={`${helpId} ${errorId}`}
                    rows={rows}
                    name={fn}
                    onInput={onChange}
                    children={renderedOptions}
                    {...{ placeholder, defaultValue: value || defaultValue }}
                ></As>
                {problem && (
                    <div id={errorId} className="text-[#f66]">
                        {problem}
                    </div>
                )}
                {isOnlyOrLastRow && helpText && (
                    <div
                        id={helpId}
                        style={{
                            marginTop: "0.5em",
                            fontSize: "91%",
                            fontStyle: "italic",
                        }}
                    >
                        {helpText}
                    </div>
                )}
            </td>
        </tr>
    );
}
