import {
    assert,
    command,
    CommandFunction,
    CreateExtensionPlugin,
    environment,
    extension,
    ExtensionPriority,
    getTextSelection,
    Helper,
    helper,
    isEmptyObject,
    OnSetOptionsProps,
    PlainExtension,
    PrimitiveSelection,
    within,
  } from '@remirror/core';
  import type { EditorState } from '@remirror/pm/state';
   
function getReplaceStep (fromDoc : Node, toDoc : Node) {
    let start = toDoc.content.findDiffStart(fromDoc.content)
    if (start === null) {
        return false
    }
    let {
        a: endA,
        b: endB
    } = toDoc.content.findDiffEnd(fromDoc.content)
    const overlap = start - Math.min(endA, endB)
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

  /**
   * This extension allows to annotate the content in your editor.
   *
   * Extend the Annotation interface to store application specific information
   * like tags or color.
   */
  @extension<{}>({
    defaultOptions: {
    },
    defaultPriority: ExtensionPriority.Low,
  })

  export class RemirrorDiffCaptureExtension extends PlainExtension<{}> {
    get name() {
      return 'diffCapture' as const;
    }
  
    protected onSetOptions(props: OnSetOptionsProps<{}>): void {
        alert("onSetOptions triggered")
        console.log('onSetOptions', props);
    }
  
    /**
     * Create the custom code block plugin which handles the delete key amongst
     * other things.
     */
    createPlugin(): CreateExtensionPlugin<DiffCaptureState> {    
      const diffState = new DiffCaptureState(this.store);
  
      return {
        
        state: {
          init() {
            return diffState;
          },
          apply(tr, action, oldState, newState) {
            // const action = tr.getMeta(AnnotationExtension.name);
            if (tr.docChanged) return diffState.apply({ tr, action });
            return action
          },
        },
        // props: {
        //   decorations(state: EditorState) {
        //     return this.getState(state)?.decorationSet;
        //   },
        // },
      };
    }
        
  }
  
  declare global {
    namespace Remirror {
      interface AllExtensions {
        diffCapture: RemirrorDiffCaptureExtension;
      }
    }
  }
  
import { Transaction, TransactionProps } from '@remirror/core';
import { Decoration, DecorationSet } from '@remirror/pm/view';
import { ReplaceStep, Step, Transform } from 'prosemirror-transform';
import { Node } from 'prosemirror-model';

interface ApplyProps extends TransactionProps {
  action: any;
}

export class DiffCaptureState {
  /**
   * Cache of changes being collected
   */
   //   changes: Array<OmitText<Type>> = [];
diffs: Step[] = [];
fromDoc: Node;
toDoc: Node;
tr: Transform;
  constructor(
    fromDoc: Node,
    // private readonly getStyle: GetStyle<Type>,
    // private readonly store: AnnotationStore<Type>,
  ) {
      this.fromDoc = fromDoc
      this.tr = new Transform(fromDoc)
}

  simplifyTr() {
    if (!this.tr.steps.length) {
        return
    }

    const newTr = new Transform(this.tr.docs[0]),
        oldSteps = this.tr.steps.slice()
    while (oldSteps.length) {
        let step = oldSteps.shift()
        while (oldSteps.length && step.merge(oldSteps[0])) {
            const addedStep = oldSteps.shift()
            if (step instanceof ReplaceStep && addedStep instanceof ReplaceStep) {
                const doesReplaceStep = getReplaceStep(
                    newTr.doc, 
                    addedStep.apply(
                        step.apply(newTr.doc).doc
                    ).doc)

                if (doesReplaceStep) step = doesReplaceStep;
            } else {
                step = step.merge(addedStep)
            }
        }
        newTr.step(step)
    }
    this.tr = newTr
}

  apply({ tr, action }: ApplyProps): this {
    const actionType = action?.type;

    if (!action && !tr.docChanged) {
      return this;
    }

    if (tr.steps.length > 1) {
        throw new Error(`TODO: multi-step transform??`)
    }
    const [thisDiff] = tr.steps
    // Adjust cached annotation positions based on changes in the editor, e.g.
    // if new text was added before the decoration.
    //
    // Note: If you see annotations getting removed here check the source of
    // the transaction and whether it contains any unexpected steps. In particular
    // 'replace' steps that modify the entire document range, such as the one
    // used by the Yjs extension for supporting `undo`, can cause issues.
    // Consider using the `disableUndo` option of the Yjs extension, if you are
    // using both the Yjs and Annotations extensions.
    let merged = false
    this.diffs = this.diffs.map((diff, i) => {        
        const newDiff = diff.map(tr.mapping)
        //     ...diff,
        //     // 1 indicates that the annotation isn't extended when the user types
        //     // at the beginning of the annotation
        //     from: tr.mapping.map(diff.from, 1),
        //     // -1 indicates that the annotation isn't extended when the user types
        //     // at the end of the annotation
        //     to: tr.mapping.map(diff.to, -1),
        // }
        const mergedInto = newDiff.merge(thisDiff)
        if (mergedInto) {
            console.log("merged into edit #"+ (i+1))
            merged = true
            return mergedInto;
        }
        const mergedWith = thisDiff.merge(newDiff) ;
         if (mergedWith) {
            console.log("merged edit #"+ (i+1) + " into this change")
            merged = true
            return mergedWith;
        }
        return newDiff
    })
    if (!merged) {
        console.log("added new change");
        this.diffs.push(thisDiff)
    }
    // // Remove annotations for which all containing content was deleted
    // .filter((diff) => diff.to !== diff.from);

    //!!! TODO !!!!
    // // Update the store with the updated annotation positions, and the remove ones
    // this.store.setAnnotations(this.annotations);

    console.log(this.diffs.length + " diffs: ", this.diffs)
    return this;
  }
}
