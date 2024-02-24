import React, { createRef, Component, useState, useCallback } from "react";
import type { ChangeEvent, ChangeEventHandler } from "react";
import { createPortal } from "react-dom";
import link from "next/link.js";
const Link = link.default;
import head from "next/head.js";
const Head = head.default;

import { EditorState, Transaction } from "prosemirror-state";
import {
    MarkdownParser,
    // MarkdownParser,
    schema as markdownSchema,
    defaultMarkdownParser,
    MarkdownSerializer,
    defaultMarkdownSerializer,
} from "prosemirror-markdown";

import { ProseMirror } from "@nytimes/react-prosemirror";

import {
    BoldExtension,
    ItalicExtension,
    UnderlineExtension,
    MarkdownExtension,
} from "remirror/extensions";
import { Remirror, useRemirror, OnChangeJSON } from "@remirror/react";
import { MarkdownEditor } from "@remirror/react-editors/markdown";

const extensions = () => [
    new BoldExtension({}),
    new ItalicExtension(),
    new MarkdownExtension({}),
];

import { CMDBCapo } from "../../contracts/CMDBCapo.js";
import type {
    BookEntry,
    BookEntryOnchain,
    BookEntryForUpdate,
    BookEntryUpdateAttrs,
    BookIndexEntry,
    BookEntryCreationAttrs,
} from "../../contracts/CMDBCapo.js";
import { Prose } from "../../components/Prose.jsx";

import { TxOutput, Wallet, dumpAny } from "@donecollectively/stellar-contracts";
import type { BookManagementProps } from "./sharedPropTypes.js";
import type { NextRouter } from "next/router.js";
import { DualEditor } from "../../lib/RemirrorDual.jsx";

type PMEvent = {
    markdownValue: string,
    pmSteps: string,
    prosemirror: true,
}

type propsType = {
    entry?: BookIndexEntry;
    create?: boolean;
    refresh: Function;
    onSave: Function;
    onClose: Function;
} & BookManagementProps;

type stateType = {
    modified: boolean;
    gen: number;
    error?: string;
    submitting?: boolean;
    saveAs?: "suggestion" | "update";
    contentMarkdown: string;    
    pmSteps: string;
    problems: Record<string, string>;
    current: BookEntryUpdateAttrs | BookEntryCreationAttrs;
};

type FieldProps = {
    rec: BookEntryUpdateAttrs | BookEntryCreationAttrs;
    fn: string;
    as?: React.ElementType;
    bare?: true;
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
          bare?: true;
          helpText?: string;
          length?: number;
          placeholder?: string;
          defaultValue?: string;
          rows?: number;
          style?: Record<string, any>;
          tableCellStyle?: Record<string, any>;
          validator?: Function;
          options?: HtmlSelectOptions;
          type?: "textarea" | "input" | "select" | React.ElementType;
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

    get mgr() {
        return this.props.bookMgrDetails;
    }

    async componentDidMount() {
        const { entry } = this.props;
        // console.error(`MOUNTED CredForm ${this.i}`)
        const current =
            entry?.pageEntry.entry ||
            ({
                ...testBookPage,
            } as BookEntryCreationAttrs);

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
            const minter = await this.mgr.bookContract.getMintDelegate();
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
            return this.mgr.reportError(
                new Error(`bad value for radio button: ${value}`),
                "saveAs",
                {}
            );
        }
        // alert("save as "+value);
        this.setState({ saveAs: value });
    };

    get isEditor() {
        return this.mgr.roles?.includes("editor");
    }

    get hasDocOwnership() {
        const { entry } = this.props;
        const { collabUut } = this.mgr;
        if (!entry || !collabUut) return false;

        return entry.pageEntry.ownerAuthority.uutName == collabUut?.name;
    }

    async save(e: React.SyntheticEvent) {
        const { current: rec, saveAs } = this.state;
        const {
            entry: { pageEntry: entryForUpdate } = {},
            refresh,
            create,
        } = this.props;
        const {
            updateState,
            reportError,
            bookContract,
            router,
            wallet,
            collabUut,
        } = this.mgr;

        e.preventDefault();
        e.stopPropagation();

        if (!saveAs)
            throw new Error(
                `missing required saveAs setting - default to Suggestion?`
            );

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
            console.log(new Date(), "@0");
            await updateState(
                `preparing ${txnDescription}`,
                { progressBar: true },
                `//mkTxn ${txnDescription}`
            );
            console.log(new Date(), "@1");
            debugger;
            const tcx = create
                ? await bookContract.mkTxnCreatingBookEntry(updatedBookEntry)
                : "update" == saveAs
                ? await bookContract.mkTxnUpdatingEntry({
                      ...entryForUpdate,
                      updated: updatedBookEntry,
                  })
                : await bookContract.mkTxnSuggestingUpdate({
                      ...entryForUpdate,
                      updated: updatedBookEntry,
                  });
            // alert("ok");
            console.log(new Date(), "@2");
            console.warn(dumpAny(tcx, bookContract.networkParams));
            console.log(new Date(), "@3");
            updateState(
                `sending the ${txnDescription} to your wallet for approval`,
                {
                    progressBar: true,
                },
                "// submit book entry to wallet"
            );
            const minDelay = new Promise((res) => setTimeout(res, 2000));

            await bookContract.submit(tcx);
            console.log(new Date(), "@4");

            await minDelay;
            console.log(new Date(), "@5");

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
            router.push("/book", "", { shallow: true });
            // this.setState({modified: true})
        } catch (error) {
            const messages: string[] = error.message.split("\n");
            // const info = messages.filter(x => x.startsWith("INFO ")).map(x => x.replace(/info \(.*?)\)\s+/, "");
            const errors = messages
                .filter((x) => x.startsWith("ERROR "))
                .map((x) => x.replace(/ERROR \(.*?\)\s+/, ""));
            if (!errors.length) errors.push(error.message || error.stack);

            console.error(error.stack);
            console.log(new Date(), "@6");

            updateState(
                "Error in txn: " + errors.join(" - ALSO -"),
                {
                    error: true,
                    moreInstructions: "Correct this error and try again",
                },
                "// error submitting txn"
            );
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

        const { bookMgrDetails, entry, create, onClose, onSave } = this.props;
        const { roles, bookContract } = bookMgrDetails;
        if (!rec) return ""; //wait for didMount
        const showTitle = <>{create ? "Creating new" : "Edit"} page</>;
        let sidebarContent;

        const { isEditor, hasDocOwnership: hasAuthority } = this;
        //! when the user has authority to apply changes, use "update" mode by default,
        //   ... but allow them to save it as a suggestion instead.
        //! if they don't have authority, they can only make a suggestion.
        let saveAs = saveAsState;
        if (!("saveAs" in (this.state || {}))) {
            if (this.mgr.collabUut) {
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
        const bookIndexEntry: BookIndexEntry | undefined = create
            ? undefined
            : entry &&
              modified && {
                  ...entry,
                  pageEntry: {
                      ...entry.pageEntry,
                      updated: rec as BookEntryUpdateAttrs,
                  },
              };
        const creatingEntry = create ? rec : undefined;
        if (entry && modified) {
            // debugger;
        }
        const pmSteps = this.state.pmSteps;
        const changeSteps = pmSteps ? JSON.parse(pmSteps ) : []
        return (
            <div>
                <Head>
                    <title>{showTitle}</title>
                </Head>
                <header className="mb-9 space-y-1">
                    <p className="font-display text-sm font-medium text-sky-500">
                        Book&nbsp;&nbsp;››&nbsp;&nbsp;
                        <Link href={`/book`}> Topics</Link>
                        &nbsp;&nbsp;››&nbsp;&nbsp;&nbsp;
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
                                {this.mgr.roles?.includes("editor") &&
                                    this.field("Entry Type", "entryType", {
                                        type: "select",
                                        options: {
                                            pg: "Page",
                                            spg: "Suggested Page",
                                        },
                                    })}
                                <tr>
                                    {!create && (
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
                                    <td style={{ textAlign: "right" }}>
                                        {(modified || !create) && (
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
                        {this.field("", "content", {
                            bare: true,
                            type: RemirrorField,
                            validator(v) {
                                if (v.length < 40)
                                    return "must be at least 40 characters";
                            },
                        })}
                    </form>
                    {modified && (
                        <>
                             {changeSteps.length} changes
                            <pre>
                                {JSON.stringify(changeSteps, null, 2)}
                            </pre>
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
            bare,
            options: selectOptions,
            style,
            validator,            
            tableCellStyle,
            rows, helpText, placeholder, defaultValue, 
        } = options || {}; //prettier-ignore

        if (bare) {
            if (label) {
                throw new Error(`Field: a bare field must have an empty label`);
            }
            if (array) {
                throw new Error(`Field: bare and Array are not compatible`);
            }
        }

        // if (fn == "content") debugger;
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
                        bare,
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
        rec: BookEntryCreationAttrs | BookEntryUpdateAttrs,
        index?: number
    ): ChangeHandler {
        const v = this.validators[fieldId];
        if (v) return v;
        const changedWithValidation: ChangeHandler = (e) => {
            if (validate) {
                //@ts-expect-error from looking at e.markdownValue, which is our funny convention
                // for passing the current markdown version of the prosemirror content
                const value = e.prosemirror ?  e.markdownValue : e.target.value;
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

        let { contentMarkdown, pmSteps } = this.state;
        //@ts-expect-error
        if (e.prosemirror) {
            const { markdownValue, pmSteps: pms } = e as unknown as PMEvent;
            contentMarkdown = markdownValue;
            pmSteps = pms;
        }

        const f = this.form.current;

        if (!f) {
            console.error("no form; no capture.");
            return;
        }
        const updatedEntry = this.capture(f, contentMarkdown, pmSteps);
        // //@ts-expect-error
        // if (updatedEntry.saveAs) {
        //     debugger;
        // }
        this.setState({
            current: updatedEntry,
            modified: true,
            contentMarkdown,
            pmSteps,
            gen: 1 + gen,
        });
    };
    capture(form, contentMarkdown: string = this.state.contentMarkdown, pmSteps: string = this.state.pmSteps) {
        const formData = new FormData(form);
        debugger
        const currentForm: BookEntryUpdateAttrs = Object.fromEntries(
            [...formData.entries()].map(([k, v]) => {
                //prettier-ignore
                const decoded = 
                    typeof v == "string" ? decodeURIComponent(v)
                        : Array.isArray(v) ? v.map(decodeURIComponent)
                        : v;
                    console.warn("decoding", k, v, "=>", decoded);
                return [k, decoded];
            })
        ) as unknown as BookEntry;
        const initial = this.props.entry || {};
        const updatedEntry = {
            ...(this.state?.current || {}),
            ...currentForm,
            content: contentMarkdown,
            pmSteps,
        };

        return updatedEntry;
    }
    mkFieldId(fn: string, index?: number): string {
        const idx = index || (index === 0 ? 0 : "");
        return `${fn}.${index || ""}`;
    }
}

function RemirrorField({
    rec,
    fn,
    onInput,
    defaultValue,
    style,
}: Partial<FieldProps> & { onInput: FieldProps["onChange"] }) {
    return (
        <div className="wrapper" style={style}>
            <DualEditor
                defaultValue={defaultValue}
                onChange={(md: string, diffsJson: string) => {
                    // alert("pe on change: "+md);
                    debugger
                    onInput({
                        //@ts-expect-error
                        markdownValue: md,
                        pmSteps: diffsJson,
                        prosemirror: true,
                    });
                }}
            />
        </div>
    );
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
    bare,
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
    // if (fn == "content") debugger;

    const content = (
        <>
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
                {...{
                    rec,
                    placeholder,
                    defaultValue: value || defaultValue,
                }}
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
        </>
    );
    if (bare) return content;

    return (
        <tr {...arrayTableStyle}>
            <th>{!!index || <label htmlFor={fieldId}> {label}</label>}</th>
            <td style={tableCellStyle || {}}>{content}</td>
        </tr>
    );
}

// class Span {
//     constructor(from, to, commit) {
//         this.from = from;
//         this.to = to;
//         this.commit = commit;
//     }
// }

// class Commit {
//     constructor(message, time, steps, maps, hidden) {
//         this.message = message;
//         this.time = time;
//         this.steps = steps;
//         this.maps = maps;
//         this.hidden = hidden;
//     }
// }

// // TrackState{
// class TrackState {
//     constructor(blameMap, commits, uncommittedSteps, uncommittedMaps) {
//         // The blame map is a data structure that lists a sequence of
//         // document ranges, along with the commit that inserted them. This
//         // can be used to, for example, highlight the part of the document
//         // that was inserted by a commit.
//         this.blameMap = blameMap;
//         // The commit history, as an array of objects.
//         this.commits = commits;
//         // Inverted steps and their maps corresponding to the changes that
//         // have been made since the last commit.
//         this.uncommittedSteps = uncommittedSteps;
//         this.uncommittedMaps = uncommittedMaps;
//     }

//     // Apply a transform to this state
//     applyTransform(transform) {
//         // Invert the steps in the transaction, to be able to save them in
//         // the next commit
//         let inverted = transform.steps.map((step, i) =>
//             step.invert(transform.docs[i])
//         );
//         let newBlame = updateBlameMap(
//             this.blameMap,
//             transform,
//             this.commits.length
//         );
//         // Create a new state—since these are part of the editor state, a
//         // persistent data structure, they must not be mutated.
//         return new TrackState(
//             newBlame,
//             this.commits,
//             this.uncommittedSteps.concat(inverted),
//             this.uncommittedMaps.concat(transform.mapping.maps)
//         );
//     }

//     // When a transaction is marked as a commit, this is used to put any
//     // uncommitted steps into a new commit.
//     applyCommit(message, time) {
//         if (this.uncommittedSteps.length == 0) return this;
//         let commit = new Commit(
//             message,
//             time,
//             this.uncommittedSteps,
//             this.uncommittedMaps
//         );
//         return new TrackState(
//             this.blameMap,
//             this.commits.concat(commit),
//             [],
//             []
//         );
//     }
// }
// // }

// //   function updateBlameMap(map, transform, id) {
// //     let result = [], mapping = transform.mapping
// //     for (let i = 0; i < map.length; i++) {
// //       let span = map[i]
// //       let from = mapping.map(span.from, 1), to = mapping.map(span.to, -1)
// //       if (from < to) result.push(new Span(from, to, span.commit))
// //     }

// //     for (let i = 0; i < mapping.maps.length; i++) {
// //       let map = mapping.maps[i], after = mapping.slice(i + 1)
// //       map.forEach((_s, _e, start, end) => {
// //         insertIntoBlameMap(result, after.map(start, 1), after.map(end, -1), id)
// //       })
// //     }

// //     return result
// //   }

// //   function insertIntoBlameMap(map, from, to, commit) {
// //     if (from >= to) return
// //     let pos = 0, next
// //     for (; pos < map.length; pos++) {
// //       next = map[pos]
// //       if (next.commit == commit) {
// //         if (next.to >= from) break
// //       } else if (next.to > from) { // Different commit, not before
// //         if (next.from < from) { // Sticks out to the left (loop below will handle right side)
// //           let left = new Span(next.from, from, next.commit)
// //           if (next.to > to) map.splice(pos++, 0, left)
// //           else map[pos++] = left
// //         }
// //         break
// //       }
// //     }

// //     while (next = map[pos]) {
// //       if (next.commit == commit) {
// //         if (next.from > to) break
// //         from = Math.min(from, next.from)
// //         to = Math.max(to, next.to)
// //         map.splice(pos, 1)
// //       } else {
// //         if (next.from >= to) break
// //         if (next.to > to) {
// //           map[pos] = new Span(to, next.to, next.commit)
// //           break
// //         } else {
// //           map.splice(pos, 1)
// //         }
// //       }
// //     }

// //     map.splice(pos, 0, new Span(from, to, commit))
// //   }

// // trackPlugin{
// import { Plugin } from "prosemirror-state";

// const trackPlugin = new Plugin({
//     state: {
//         init(_, instance) {
//             return new TrackState(
//                 [new Span(0, instance.doc.content.size, null)],
//                 [],
//                 [],
//                 []
//             );
//         },
//         apply(tr, tracked) {
//             if (tr.docChanged) tracked = tracked.applyTransform(tr);
//             let commitMessage = tr.getMeta(this);
//             if (commitMessage)
//                 tracked = tracked.applyCommit(commitMessage, new Date(tr.time));
//             return tracked;
//         },
//     },
// });
// // }

// import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
// //   import {exampleSetup} from "prosemirror-example-setup"

// function elt(name, attrs, ...children) {
//     let dom = document.createElement(name);
//     if (attrs) for (let attr in attrs) dom.setAttribute(attr, attrs[attr]);
//     for (let i = 0; i < children.length; i++) {
//         let child = children[i];
//         dom.appendChild(
//             typeof child == "string" ? document.createTextNode(child) : child
//         );
//     }
//     return dom;
// }

// //   const highlightPlugin = new Plugin({
// //     state: {
// //       init() { return {deco: DecorationSet.empty, commit: null} },
// //       apply(tr, prev, oldState, state) {
// //         let highlight = tr.getMeta(this)
// //         if (highlight && highlight.add != null && prev.commit != highlight.add) {
// //           let tState = trackPlugin.getState(oldState)
// //           let decos = tState.blameMap
// //               .filter(span => tState.commits[span.commit] == highlight.add)
// //               .map(span => Decoration.inline(span.from, span.to, {class: "blame-marker"}))
// //           return {deco: DecorationSet.create(state.doc, decos), commit: highlight.add}
// //         } else if (highlight && highlight.clear != null && prev.commit == highlight.clear) {
// //           return {deco: DecorationSet.empty, commit: null}
// //         } else if (tr.docChanged && prev.commit) {
// //           return {deco: prev.deco.map(tr.mapping, tr.doc), commit: prev.commit}
// //         } else {
// //           return prev
// //         }
// //       }
// //     },
// //     props: {
// //       decorations(state) { return this.getState(state).deco }
// //     }
// //   })

// let state = EditorState.create({
//         schema: markdownSchema,
//         plugins: exampleSetup({ schema }).concat(
//             trackPlugin
//             // highlightPlugin
//         ),
//     }),
//     view;

// let lastRendered = null;

// function dispatch(tr) {
//     state = state.apply(tr);
//     view.updateState(state);
//     setDisabled(state);
//     renderCommits(state, dispatch);
// }

// //   view = window.view = new EditorView(document.querySelector("#editor"), {state, dispatchTransaction: dispatch})

// dispatch(state.tr.insertText("Type something, and then commit it."));
// dispatch(state.tr.setMeta(trackPlugin, "Initial commit"));

// function setDisabled(state) {
//     let input = document.querySelector("#message");
//     let button = document.querySelector("#commitbutton");
//     //@ts-ignore
//     input.disabled = button.disabled =
//         trackPlugin.getState(state).uncommittedSteps.length == 0;
// }

// function doCommit(message) {
//     dispatch(state.tr.setMeta(trackPlugin, message));
// }

// function renderCommits(state, dispatch) {
//     let curState = trackPlugin.getState(state);
//     if (lastRendered == curState) return;
//     lastRendered = curState;

//     let out = document.querySelector("#commits");
//     out.textContent = "";
//     let commits = curState.commits;
//     commits.forEach((commit) => {
//         let node = elt(
//             "div",
//             { class: "commit" },
//             elt(
//                 "span",
//                 { class: "commit-time" },
//                 commit.time.getHours() +
//                     ":" +
//                     (commit.time.getMinutes() < 10 ? "0" : "") +
//                     commit.time.getMinutes()
//             ),
//             "\u00a0 " + commit.message + "\u00a0 ",
//             elt("button", { class: "commit-revert" }, "revert")
//         );
//         //   node.lastChild.addEventListener("click", () => revertCommit(commit))
//         //   node.addEventListener("mouseover", e => {
//         //     if (!node.contains(e.relatedTarget))
//         //       dispatch(state.tr.setMeta(highlightPlugin, {add: commit}))
//         //   })
//         //   node.addEventListener("mouseout", e => {
//         //     if (!node.contains(e.relatedTarget))
//         //       dispatch(state.tr.setMeta(highlightPlugin, {clear: commit}))
//         //   })
//         out.appendChild(node);
//     });
// }

// // revertCommit{
// import { Mapping } from "prosemirror-transform";

// //   function revertCommit(commit) {
// //     let trackState = trackPlugin.getState(state)
// //     let index = trackState.commits.indexOf(commit)
// //     // If this commit is not in the history, we can't revert it
// //     if (index == -1) return

// //     // Reverting is only possible if there are no uncommitted changes
// //     if (trackState.uncommittedSteps.length)
// //       return alert("Commit your changes first!")

// //     // This is the mapping from the document as it was at the start of
// //     // the commit to the current document.
// //     let remap = new Mapping(trackState.commits.slice(index)
// //                             .reduce((maps, c) => maps.concat(c.maps), []))
// //     let tr = state.tr
// //     // Build up a transaction that includes all (inverted) steps in this
// //     // commit, rebased to the current document. They have to be applied
// //     // in reverse order.
// //     for (let i = commit.steps.length - 1; i >= 0; i--) {
// //       // The mapping is sliced to not include maps for this step and the
// //       // ones before it.
// //       let remapped = commit.steps[i].map(remap.slice(i + 1))
// //       if (!remapped) continue
// //       let result = tr.maybeStep(remapped)
// //       // If the step can be applied, add its map to our mapping
// //       // pipeline, so that subsequent steps are mapped over it.
// //       if (result.doc) remap.appendMap(remapped.getMap(), i)
// //     }
// //     // Add a commit message and dispatch.
// //     if (tr.docChanged)
// //       dispatch(tr.setMeta(trackPlugin, `Revert '${commit.message}'`))
// //   }
// //   // }

// document.querySelector("#commit").addEventListener("submit", (e) => {
//     e.preventDefault();
//     doCommit(e.target.elements.message.value || "Unnamed");
//     e.target.elements.message.value = "";
//     view.focus();
// });

// //   function findInBlameMap(pos, state) {
// //     let map = trackPlugin.getState(state).blameMap
// //     for (let i = 0; i < map.length; i++)
// //       if (map[i].to >= pos && map[i].commit != null)
// //         return map[i].commit
// //   }

// //   document.querySelector("#blame").addEventListener("mousedown", e => {
// //     e.preventDefault()
// //     let pos = e.target.getBoundingClientRect()
// //     let commitID = findInBlameMap(state.selection.head, state)
// //     let commit = commitID != null && trackPlugin.getState(state).commits[commitID]
// //     let node = elt("div", {class: "blame-info"},
// //                    commitID != null ? elt("span", null, "It was: ", elt("strong", null, commit ? commit.message : "Uncommitted"))
// //                    : "No commit found")
// //     node.style.right = (document.body.clientWidth - pos.right) + "px"
// //     node.style.top = (pos.bottom + 2) + "px"
// //     document.body.appendChild(node)
// //     setTimeout(() => document.body.removeChild(node), 2000)
// //   })
