import React, { createRef, Component } from "react";
import type { ChangeEvent, ChangeEventHandler } from "react";
import { createPortal } from "react-dom";
import { CMDBCapo } from "../../contracts/CMDBCapo.js";
import type {
    BookEntry,
    BookEntryOnchain,
    BookEntryForUpdate,
    BookEntryUpdateAttrs,
} from "../../contracts/CMDBCapo.js";
import { Prose } from "../../components/Prose.jsx";
import head from "next/head.js";
const Head = head.default;

import { TxOutput, Wallet, dumpAny } from "@donecollectively/stellar-contracts";
import type { BookManagementProps } from "./sharedPropTypes.js";
import type { NextRouter } from "next/router.js";
import { PageView } from "./PageView.jsx";

type propsType = {
    entry?: BookEntryForUpdate;
    create?: boolean;
    refresh: Function;
    router: NextRouter;
    onSave: Function;
    onClose: Function;
} & BookManagementProps;

type stateType = {
    modified: boolean;
    gen: number;
    error?: string;
    submitting?: boolean;
    saveAs?: "suggestion" | "update";
    problems: Record<string, string>;
    current: BookEntry | BookEntryUpdateAttrs;
};

type FieldProps = {
    rec: BookEntryUpdateAttrs;
    fn: string;
    as?: React.ElementType;
    rows?: number;
    options?: HtmlSelectOptions;
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

const testBookPage: Partial<BookEntry> = {
    title: "Test Page",
    entryType: "spg",
    content: "## test page\n\nthis is a sample paragraph",
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

type HtmlSelectOptions = string[] | Record<string, string>;

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
          options?: HtmlSelectOptions;
          type?: "textarea" | "input" | "select";
      }
    | undefined;

let mountCount = 0;

export class PageEditor extends React.Component<propsType, stateType> {
    form = createRef<HTMLFormElement>();
    i: number;
    constructor(props) {
        super(props);
        this.i = mountCount += 1;
        this.save = this.save.bind(this);
        this.form = React.createRef();
    }

    async componentDidMount() {
        const { entry, bookContract } = this.props;
        // console.error(`MOUNTED CredForm ${this.i}`)
        const current =
            entry?.entry ||
            ({
                ...testBookPage,
            } as BookEntry);
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
            const minter = await bookContract.getMintDelegate();
        } catch (error) {
            console.error(error.stack);
            debugger;
            this.setState({ error: error.message });
        }
    }
    _unmounting?: true;
    componentWillUnmount(): void {
        // console.error(`UNMOUNTing PageEditor ${this.i}`)
        // this._unmounting = true;
    }

    onSaveAsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value !== "suggestion" && value !== "update") {
            return this.props.reportError(
                new Error(`bad value for radio button: ${value}`),
                "saveAs",
                {}
            );
        }
        // alert("save as "+value);
        this.setState({ saveAs: value });
    };

    get isEditor() {
        return this.props?.roles?.includes("editor");
    }

    get hasDocOwnership() {
        const { entry, collabUut } = this.props;
        if (!entry || !collabUut) return false;

        return entry.ownerAuthority.uutName == collabUut?.name;
    }

    async save(e: React.SyntheticEvent) {
        const { current: rec, saveAs } = this.state;
        const {
            entry: entryForUpdate,
            refresh,
            updateState,
            reportError,
            bookContract,
            router,
            create,
            wallet,
            collabUut,
        } = this.props;
        e.preventDefault();
        e.stopPropagation();

        if (!saveAs) throw new Error(`missing required saveAs setting - default to Suggestion?`);
        
        //! clears "undefined" problems that may have existed temporarily
        const problems = JSON.parse(JSON.stringify(this.state.problems));
        if (Object.keys(problems).length) {
            this.setState({ problems, submitting: true });
            return;
        }

        const form = e.target as HTMLFormElement;
        const updatedBookEntry = this.capture(form);
        const { isEditor, hasDocOwnership } = this;

        try {
            const txnDescription = `${create ? "creation" : "update"} txn`;
            updateState(
                `preparing ${txnDescription}`,
                { progressBar: true },
                `//mkTxn ${txnDescription}`
            );
            const tcx = create
                ? await bookContract.mkTxnCreatingBookEntry(updatedBookEntry)
                : "update"== saveAs 
                ? await bookContract.mkTxnUpdatingEntry({
                      ...entryForUpdate,
                      updated: updatedBookEntry
                  })
                  : await bookContract.mkTxnSuggestingUpdate({
                    ...entryForUpdate,
                    updated: updatedBookEntry,
                  })

            console.warn(dumpAny(tcx));
            updateState(
                `sending the ${txnDescription} to your wallet for approval`,
                {
                    progressBar: true,
                },
                "// submit book entry to wallet"
            );
            const minDelay = new Promise((res) => setTimeout(res, 2000));

            await bookContract.submit(tcx);
            await minDelay;
            // updateState(`submitting the ${txnDescription} to the network`,);
            refresh().then(async () => {
                updateState(
                    `The update will take a few moments before it's confirmed`,
                    {},
                    "//@user: be patient"
                );
                await new Promise((res) => setTimeout(res, 3000));
                updateState("", {}, "// clear patience msg");
            });
            router.push("/book");
            // this.setState({modified: true})
        } catch (error) {
            console.error(error.stack);
            debugger;
            reportError(error, "submitting book-entry txn", {});
        }
    }

    render() {
        const {
            current: rec,
            modified,
            error,
            submitting,
            saveAs: saveAsState,
            problems,
        } = this.state || {};
        const { entry, create, roles, onClose, onSave, bookContract } =
            this.props;
        if (!rec) return ""; //wait for didMount
        const showTitle = <>{create ? "Creating new" : "Edit"} page</>;
        let sidebarContent;

        const { isEditor, hasDocOwnership: hasAuthority } = this;
        //! when the user has authority to apply changes, use "update" mode by default,
        //   ... but allow them to save it as a suggestion instead.
        //! if they don't have authority, they can only make a suggestion.
        let saveAs = saveAsState;
        if (!("saveAs" in (this.state || {}))) {
            if (this.props.collabUut) {
                saveAs = hasAuthority ? "update" : "suggestion";
                setTimeout(() => {
                    // alert("appkying " +saveAs);
                    this.setState({
                        saveAs,
                    });
                }, 100);
            }
        }
        //! an editor CAN use direct update, but with "suggestion" by default.
        const canDoDirectUpdate = hasAuthority || isEditor;
        const isSuggesting = "suggestion" == saveAs;
        const isUpdating = "update" == saveAs;

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
                                    The page content will be shown on this
                                    website and visible in the Cardano
                                    blockchain.
                                </p>

                                <p
                                    style={{
                                        fontStyle: "italic",
                                        marginTop: "4em",
                                    }}
                                >
                                    Your collaborator-token is required for
                                    making modifications to the page, and for
                                    accepting changes other collaborators may
                                    propose.
                                </p>

                                <p style={{ fontStyle: "italic" }}>
                                    The page will start in "suggested" state,
                                    and will have an expiration date. The book
                                    editor(s) can accept the page officially
                                    into the book. You'll normally continue to
                                    have ownership of the page, with the
                                    authority to approve changes to the page
                                    content.
                                </p>
                            </Prose>,
                            portalTarget
                        )}
                    </div>
                );
            }
        }

        const breadcrumbTitle = create ? "new" : rec.title;
        return (
            <div>
                <Head>
                    <title>{showTitle}</title>
                </Head>
                <header className="mb-9 space-y-1">
                    <p className="font-display text-sm font-medium text-sky-500">
                        Book&nbsp;&nbsp;››&nbsp;&nbsp;Topics&nbsp;&nbsp;››&nbsp;&nbsp;&nbsp;
                        {breadcrumbTitle}
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
                                {this.field("Page Title", "title", {
                                    placeholder: "Book Index title",
                                    validator(v) {
                                        if (v.length < 8)
                                            return "must be at least 8 characters";
                                    },
                                })}
                                {this.props.roles?.includes("editor") &&
                                    this.field("Entry Type", "entryType", {
                                        type: "select",
                                        options: {
                                            pg: "Page",
                                            spg: "Suggested Page",
                                        },
                                    })}
                                {this.field("Content", "content", {
                                    type: "textarea",
                                    rows: 15,
                                    validator(v) {
                                        if (v.length < 40)
                                            return "must be at least 40 characters";
                                    },
                                })}
                                <tr>
                                    {modified && !create && (
                                        <>
                                            <th className="text-right">
                                                Save as...
                                            </th>
                                            <th className="pl-4 align-baseline text-base">
                                                <label
                                                    htmlFor="save-as-update"
                                                    className={`${
                                                        canDoDirectUpdate
                                                            ? ""
                                                            : "opacity-30"
                                                    } form--radio-label ${
                                                        isUpdating
                                                            ? "font-bold text-[#ccc]"
                                                            : "text-sm"
                                                    }`}
                                                >
                                                    <input
                                                        id="save-as-update"
                                                        name="saveAs"
                                                        type="radio"
                                                        value="update"
                                                        checked={isUpdating}
                                                        onChange={
                                                            this.onSaveAsChange
                                                        }
                                                        disabled={
                                                            !canDoDirectUpdate
                                                        }
                                                    />
                                                    &nbsp;&nbsp;Direct update
                                                </label>
                                                &nbsp;&nbsp;&nbsp;&nbsp;
                                                <label
                                                    htmlFor="save-as-suggestion"
                                                    className={`form--radio-label ${
                                                        isSuggesting
                                                            ? "font-bold"
                                                            : "text-sm "
                                                    }`}
                                                >
                                                    <input
                                                        id="save-as-suggestion"
                                                        name="saveAs"
                                                        type="radio"
                                                        value="suggestion"
                                                        checked={isSuggesting}
                                                        onChange={
                                                            this.onSaveAsChange
                                                        }
                                                    />
                                                    &nbsp;&nbsp;Suggestion
                                                </label>
                                            </th>
                                        </>
                                    )}
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
                            <PageView
                                {...{
                                    entry: { ...entry, entry: rec },
                                    bookContract,
                                    collabUut: this.props.collabUut,
                                    connectingWallet:
                                        this.props.connectingWallet,
                                    roles: this.props.roles,
                                    updateState: this.props.updateState,
                                    reportError: this.props.reportError,
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
                                    ? this.mkChangeValidator(
                                          fieldId,
                                          validator,
                                          rec,
                                          index
                                      )
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
    mkChangeValidator(
        fieldId: string,
        validate: Function,
        rec: BookEntryUpdateAttrs,
        index?: number
    ): ChangeHandler {
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
                            problems: JSON.parse(
                                JSON.stringify({
                                    ...problems,
                                    [fieldId]: problem,
                                })
                            ),
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
            current: {},
            gen = 0,
        } = this.state;

        const f = this.form.current;
        const updatedEntry = this.capture(f);
        //@ts-expect-error
        if (updatedEntry.saveAs) {
            debugger;
        }
        this.setState({
            current: updatedEntry,
            modified: true,
            gen: 1 + gen,
        });
    };
    capture(form) {
        const formData = new FormData(form);
        const currentForm: BookEntryUpdateAttrs = Object.fromEntries(
            formData.entries()
        ) as unknown as BookEntry;

        const initial = this.props.entry || {};
        const updatedEntry = {
            ...(this.state?.current || {}),
            ...currentForm,
        };

        return updatedEntry;
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
    const optionsAsKV =
        options && Array.isArray(options)
            ? Object.fromEntries(
                  options.map((s) => {
                      return [s, s];
                  })
              )
            : options;

    const renderedOptions = optionsAsKV
        ? Object.entries(optionsAsKV).map(([k, v]) => {
              return (
                  <option key={k} value={k}>
                      {v}
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
