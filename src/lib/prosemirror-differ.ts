import {
    Transform, ReplaceStep,
    Step
} from 'prosemirror-transform'
import {
    applyPatch, createPatch, type Patch
} from 'rfc6902'
import {diffWordsWithSpace, diffChars} from 'diff'
import { Mark, MarkType, type Node, type Schema } from "prosemirror-model";

// ORIGINALLY FROM prosemirror-recreate-steps
// Its NOTICE file is included here, to comply with its APACHE license.
// --- begin NOTICE 
// prosemirror-recreate-steps
// Copyright 2018 Atypon Systems, LLC.
// --- end
// see also LICENSE-prosemirror-recreate-steps file.

// THIS FILE IS MODIFIED FROM the ORIGINAL



function getReplaceStep (fromDoc: Node, toDoc: Node) {
    let start = toDoc.content.findDiffStart(fromDoc.content)
    if (start === null) {
        return false
    }
    let {
        a: endA,
        b: endB
    } = toDoc.content.findDiffEnd(fromDoc.content)
    const overlap = start - Math.min(endA, endB);

    if (overlap > 0) {
        if (
            // If there is an overlap, there is some freedom of choise in how to calculate the start/end boundary.
            // for an inserted/removed slice. We choose the extreme with the lowest depth value.
            fromDoc.resolve(start - overlap).depth < toDoc.resolve(endA + overlap).depth
        ) {
            start -= overlap
        } else {
            endA += overlap
            endB += overlap
        }
    }
    return new ReplaceStep(start, endB, toDoc.slice(start, endA))
}

class DiffTransformer {
    fromDoc: Node;
    toDoc: Node;
    complexSteps: boolean;
    wordDiffs: boolean;
    schema: Schema;
    currentJSON: any;
    finalJSON: any;
    ops: Patch;
    tr: Transform;
    constructor(fromDoc, toDoc, complexSteps, wordDiffs) {
        this.fromDoc = fromDoc;
        this.toDoc = toDoc;
        this.complexSteps = complexSteps; // Whether to return steps other than ReplaceSteps
        this.wordDiffs = wordDiffs; // Whether to make text diffs cover entire words
        this.schema = fromDoc.type.schema;
        if (!this.schema.marks.del) {
            throw new Error(
                `The document schema is missing a required mark: 'del' for marking deletions`
            );
        }
        if (!this.schema.marks.ins) {
            throw new Error(
                `The document schema is missing a required mark: 'ins' for marking insertions`
            );
        }
        this.tr = new Transform(fromDoc);
    }

    init() {
        if (this.complexSteps) {
            // For First steps: we create versions of the documents without marks as
            // these will only confuse the diffing mechanism and marks won't cause
            // any mapping changes anyway.
            this.currentJSON = this.marklessDoc(this.fromDoc).toJSON();
            this.finalJSON = this.marklessDoc(this.toDoc).toJSON();
            this.ops = createPatch(this.currentJSON, this.finalJSON);
            this.recreateChangeContentSteps();
            this.recreateChangeMarkSteps();
        } else {
            // We don't differentiate between mark changes and other changes.
            this.currentJSON = this.fromDoc.toJSON();
            this.finalJSON = this.toDoc.toJSON();
            this.ops = createPatch(this.currentJSON, this.finalJSON);
            this.recreateChangeContentSteps();
        }

        this.simplifyTr();

        return this.tr;
    }

    recreateChangeContentSteps() {
        // First step: find content changing steps.
        let ops = [];
        while (this.ops.length) {
            debugger
            let op = this.ops.shift();
            console.log("recreateChangeContentSteps: ", op.op, op.path)
            let toDoc: false | Node = false;
            const afterStepJSON = JSON.parse(JSON.stringify(this.currentJSON)),
                pathParts = op.path.split("/");
            ops.push(op)
            while (!toDoc) {
                applyPatch(afterStepJSON, [op]);
                try {
                    toDoc = this.schema.nodeFromJSON(afterStepJSON);
                    toDoc.check();
                } catch (error) {
                    toDoc = false;
                    if (this.ops.length) {
                        op = this.ops.shift()
                        ops.push(op);
                    } else {
                        throw new Error("No valid diff possible!");
                    }
                }
            }

            if (
                this.complexSteps &&
                ops.length === 1 &&
                (pathParts.includes("attrs") || pathParts.includes("type"))
            ) {
                // Node markup is changing
                /* console.log( */ throw new Error("TODO: support these markup changes")
                this.addSetNodeMarkup();
                ops = [];
            } else if (
                ops.length === 1 &&
                op.op === "replace" &&
                pathParts[pathParts.length - 1] === "text"
            ) {
                console.log("// Text is being replaced, we apply text diffing to find the smallest possible diffs.");
                debugger
                this.addReplaceTextSteps(op, afterStepJSON);
                ops = [];
            } else {
                // offsets broken here
                debugger
                console.log("skipped problematic replace - fixup op to match current version of document?")
                // if (this.addReplaceStep(toDoc, afterStepJSON)) {
                //     ops = [];
                // }
            }
        }
    }

    recreateChangeMarkSteps() {
        // Now the documents should be the same, except their marks, so everything should map 1:1.
        // Second step: Iterate through the toDoc and make sure all marks are the same in tr.doc
        this.toDoc.descendants((tNode, tPos) => {
            if (!tNode.isInline) {
                return true;
            }

            this.tr.doc.nodesBetween(
                tPos,
                tPos + tNode.nodeSize,
                (fNode, fPos) => {
                    if (!fNode.isInline) {
                        return true;
                    }
                    const from = Math.max(tPos, fPos),
                        to = Math.min(
                            tPos + tNode.nodeSize,
                            fPos + fNode.nodeSize
                        );
                    fNode.marks.forEach((nodeMark) => {
                        if (!nodeMark.isInSet(tNode.marks)) {
                            this.tr.removeMark(from, to, nodeMark);
                        }
                    });
                    tNode.marks.forEach((nodeMark) => {
                        if (!nodeMark.isInSet(fNode.marks)) {
                            this.tr.addMark(from, to, nodeMark);
                        }
                    });
                }
            );
        });
    }

    marklessDoc(doc: Node): Node {
        const tr = new Transform(doc);
        tr.removeMark(0, doc.nodeSize - 2);
        return tr.doc;
    }

    // From http://prosemirror.net/examples/footnote/
    addReplaceStep(toDoc: Node, afterStepJSON: any) {
        const fromDoc = this.schema.nodeFromJSON(this.currentJSON),
            step = getReplaceStep(fromDoc, toDoc);
        if (!step) {
            return false;
        } else if (!this.tr.maybeStep(step).failed) {
            this.currentJSON = afterStepJSON;
        } else {
            throw new Error("No valid step found.");
        }
    }

    addSetNodeMarkup() {
        const fromDoc = this.schema.nodeFromJSON(this.currentJSON),
            toDoc = this.schema.nodeFromJSON(this.finalJSON),
            start = toDoc.content.findDiffStart(fromDoc.content),
            fromNode = fromDoc.nodeAt(start),
            toNode = toDoc.nodeAt(start);
        if (start != null) {
            this.tr.setNodeMarkup(
                start,
                fromNode.type === toNode.type ? null : toNode.type,
                toNode.attrs,
                toNode.marks
            );
            this.currentJSON = this.marklessDoc(this.tr.doc).toJSON();
            // Setting the node markup may have invalidated more ops, so we calculate them again.
            this.ops = createPatch(this.currentJSON, this.finalJSON);
        }
    }

    addReplaceTextSteps(op, afterStepJSON) {
        // We find the position number of the first character in the string
        const op1 = Object.assign({}, op, { value: "xx" }),
            op2 = Object.assign({}, op, { value: "yy" });

        const afterOP1JSON = JSON.parse(JSON.stringify(this.currentJSON)),
            afterOP2JSON = JSON.parse(JSON.stringify(this.currentJSON)),
            pathParts = op.path.split("/");

        let obj = this.currentJSON;

        applyPatch(afterOP1JSON, [op1]);
        applyPatch(afterOP2JSON, [op2]);

        const op1Doc = this.schema.nodeFromJSON(afterOP1JSON),
            op2Doc = this.schema.nodeFromJSON(afterOP2JSON);

        let offset = op1Doc.content.findDiffStart(op2Doc.content);
        const marks = op1Doc.resolve(offset + 1).marks();

        pathParts.shift();

        while (pathParts.length) {
            const pathPart = pathParts.shift();
            obj = obj[pathPart];
        }

        const finalText = op.value,
            currentText = obj;

        const textDiffs = this.wordDiffs
            ? diffWordsWithSpace(currentText, finalText)
            : diffChars(currentText, finalText);
        debugger;

        while (textDiffs.length) {
            const diff = textDiffs.shift();
            if (diff.added) {
                if (textDiffs.length && textDiffs[0].removed) {
                    const nextDiff = textDiffs.shift();
                    console.log(`changed '${diff.value}' to '${nextDiff.value}' at ${offset}+${nextDiff.value.length}` )
                    debugger
                    this.tr.replaceWith(
                        offset,
                        offset + nextDiff.value.length,
                        [
                            this.mkDeletionNode(nextDiff.value, marks),
                            this.mkInsertionNode(diff.value, marks),
                        ]
                    );
                    offset += nextDiff.value.length + diff.value.length;
                } else {
                    console.log(`added '${diff.value}' at ${offset}`);
                    this.tr.insert(
                        offset,
                        this.mkInsertionNode(diff.value, marks)
                    );
                    offset += diff.value.length;
                }
            } else if (diff.removed) {
                if (textDiffs.length && textDiffs[0].added) {
                    const nextDiff = textDiffs.shift();
                    console.log(`changed '${diff.value}' to '${nextDiff.value}' at ${offset}+${diff.value.length}` )
                    this.tr.replaceWith(
                        offset,
                        offset + diff.value.length,
                        [
                            this.mkDeletionNode(diff.value, marks),
                            this.mkInsertionNode(nextDiff.value, marks),
                        ]
                    );
                    offset += nextDiff.value.length + diff.value.length;
                } else {
                    console.log(`removed '${diff.value}' at ${offset}+${diff.value.length}` )
                    this.tr.replaceWith(
                        offset,
                        offset + diff.value.length,
                        this.mkDeletionNode(diff.value, marks)
                        );
                    offset += diff.value.length;
                }
            } else {
                offset += diff.value.length;
            }
        }
        this.currentJSON = afterStepJSON;
    }

    mkDeletionNode(removedText: string, existingMarks: readonly Mark[]): Node {
        return this.schema
            .nodeFromJSON({ type: "text", text: removedText })
            .mark([
                ...existingMarks,
                this.deletionMark({ class: "diff deletion" }),
            ]);
    }

    mkInsertionNode(addedText: string, existingMarks: readonly Mark[]): Node {
        return this.schema
            .nodeFromJSON({ type: "text", text: addedText })
            .mark([
                ...existingMarks,
                this.insertionMark({ class: "diff insertion" }),
            ]);
    }

    insertionMark(...args: Parameters<MarkType["create"]>) {
        return this.schema.marks.ins.create(...args);
    }
    deletionMark(...args: Parameters<MarkType["create"]>) {
        return this.schema.marks.del.create(...args);
    }

    // join adjacent ReplaceSteps
    simplifyTr() {
        if (!this.tr.steps.length) {
            return;
        }

        const newTr = new Transform(this.tr.docs[0]),
            oldSteps = this.tr.steps.slice();
        while (oldSteps.length) {
            let step: Step = oldSteps.shift();
            while (oldSteps.length && step.merge(oldSteps[0])) {
                const addedStep = oldSteps.shift();
                if (
                    step instanceof ReplaceStep &&
                    addedStep instanceof ReplaceStep
                ) {
                    const stepDetails = getReplaceStep(
                        newTr.doc,
                        addedStep.apply(step.apply(newTr.doc).doc).doc
                    );
                    if (!stepDetails) {
                        throw new Error("No valid step found.");
                    }
                    step = stepDetails;
                } else {
                    step = step.merge(addedStep);
                }
            }
            newTr.step(step);
        }
        this.tr = newTr;
    }
}

export function mkDiffTransform(fromDoc, toDoc, complexSteps = true, wordDiffs = false) {
    const recreator = new DiffTransformer(fromDoc, toDoc, complexSteps, wordDiffs)
    return recreator.init()
}
