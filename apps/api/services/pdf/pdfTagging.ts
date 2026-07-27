/**
 * Accessibility (tagging) layer for generated PDFs.
 *
 * A PDF is only readable by a screen reader if its content stream is split into
 * marked-content sequences that a logical structure tree points at — plain
 * `drawText` produces visually correct but semantically empty output. pdf-lib
 * has no structure-tree API, so this builds one on top of its low-level object
 * model:
 *
 *   drawing  →  /P << /MCID n >> BDC … EMC   in the page content stream
 *   meaning  →  StructElem (/S /P, /Pg page, /K n) in the structure tree
 *   linkage  →  ParentTree maps (page, MCID) back to its StructElem
 *
 * Decoration (logo, rules, footers) must NOT appear in the tree — it is wrapped
 * as /Artifact so assistive tech skips it instead of reading it aloud.
 *
 * Usage is stack-based and mirrors the document outline:
 *   tagger.open('L'); tagger.open('LI'); tagger.content(page, () => …); tagger.close(); …
 */

import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Ops,
  PDFString,
  type PDFDocument,
  type PDFPage,
  type PDFRef,
} from 'pdf-lib';

/** Standard structure types (PDF 32000-1, 14.8.4) — no RoleMap needed. */
export type StructTag =
  | 'Document'
  | 'Sect'
  | 'H1'
  | 'H2'
  | 'H3'
  | 'P'
  | 'L'
  | 'LI'
  | 'Lbl'
  | 'LBody'
  | 'Table'
  | 'TR'
  | 'TH'
  | 'TD'
  | 'Caption'
  | 'BlockQuote'
  | 'Form'
  | 'Figure';

interface StructKid {
  kind: 'elem' | 'mc' | 'obj';
  ref?: PDFRef;
  page?: PDFPage;
  mcid?: number;
}

interface StructNode {
  tag: StructTag;
  ref: PDFRef;
  dict: PDFDict;
  kids: StructKid[];
  page: PDFPage | null;
}

interface PageState {
  /** Parent-tree key stored as the page's /StructParents. */
  key: number;
  /** Owning struct element per MCID — index IS the MCID. */
  owners: PDFRef[];
  nextMcid: number;
}

export interface StructMeta {
  alt?: string;
  lang?: string;
  title?: string;
  scope?: 'Row' | 'Column';
}

export interface TaggingChecks {
  taggedContent: boolean;
  structureTree: boolean;
  documentLanguage: boolean;
  documentTitle: boolean;
  /** Every form widget carries an accessible name (/TU). */
  labelledFields: boolean;
}

export class PdfTagger {
  private readonly nodes: StructNode[] = [];
  private readonly stack: StructNode[] = [];
  private readonly pages = new Map<PDFPage, PageState>();
  /** Parent-tree entries for annotations: key → owning struct element. */
  private readonly annotEntries: Array<{ key: number; ref: PDFRef }> = [];
  private readonly structRootRef: PDFRef;
  private readonly root: StructNode;
  private nextKey = 0;
  private markedAnyContent = false;
  private fieldsWithoutLabel = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly opts: { language: string; title: string }
  ) {
    this.structRootRef = doc.context.nextRef();
    this.root = this.createNode('Document', this.structRootRef);
    this.stack.push(this.root);
  }

  private createNode(tag: StructTag, parentRef: PDFRef): StructNode {
    const ctx = this.doc.context;
    const dict = ctx.obj({}) as PDFDict;
    dict.set(PDFName.of('Type'), PDFName.of('StructElem'));
    dict.set(PDFName.of('S'), PDFName.of(tag));
    dict.set(PDFName.of('P'), parentRef);
    const node: StructNode = { tag, ref: ctx.nextRef(), dict, kids: [], page: null };
    this.nodes.push(node);
    return node;
  }

  private get current(): StructNode {
    return this.stack[this.stack.length - 1];
  }

  private pageState(page: PDFPage): PageState {
    let state = this.pages.get(page);
    if (!state) {
      state = { key: this.nextKey++, owners: [], nextMcid: 0 };
      this.pages.set(page, state);
      page.node.set(PDFName.of('StructParents'), PDFNumber.of(state.key));
      // Tab order follows the structure tree — required for keyboard users.
      page.node.set(PDFName.of('Tabs'), PDFName.of('S'));
    }
    return state;
  }

  /** Open a structure element; every `open` needs a matching `close`. */
  open(tag: StructTag, meta?: StructMeta): void {
    const parent = this.current;
    const node = this.createNode(tag, parent.ref);
    if (meta?.alt) node.dict.set(PDFName.of('Alt'), PDFHexString.fromText(meta.alt));
    if (meta?.lang) node.dict.set(PDFName.of('Lang'), PDFString.of(meta.lang));
    if (meta?.title) node.dict.set(PDFName.of('T'), PDFHexString.fromText(meta.title));
    if (meta?.scope) {
      // Tells a screen reader whether a header cell heads its row or its column.
      const attrs = this.doc.context.obj({}) as PDFDict;
      attrs.set(PDFName.of('O'), PDFName.of('Table'));
      attrs.set(PDFName.of('Scope'), PDFName.of(meta.scope));
      node.dict.set(PDFName.of('A'), attrs);
    }
    parent.kids.push({ kind: 'elem', ref: node.ref });
    this.stack.push(node);
  }

  close(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  /** Run `open`/`close` around a callback so the stack can never leak. */
  tag<T>(tagName: StructTag, draw: () => T, meta?: StructMeta): T {
    this.open(tagName, meta);
    try {
      return draw();
    } finally {
      this.close();
    }
  }

  /** Mark everything `draw` paints as content of the current structure element. */
  content<T>(page: PDFPage, draw: () => T): T {
    const node = this.current;
    const state = this.pageState(page);
    const mcid = state.nextMcid++;
    state.owners[mcid] = node.ref;
    node.kids.push({ kind: 'mc', page, mcid });
    if (!node.page) node.page = page;

    // The property list is written as an inline dictionary — pdf-lib's operator
    // args accept a raw string, which is exactly what BDC expects here.
    page.pushOperators(
      PDFOperator.of(Ops.BeginMarkedContentSequence, [PDFName.of(node.tag), `<< /MCID ${mcid} >>`])
    );
    this.markedAnyContent = true;
    try {
      return draw();
    } finally {
      page.pushOperators(PDFOperator.of(Ops.EndMarkedContent));
    }
  }

  /** Purely decorative output — kept out of the structure tree entirely. */
  artifact<T>(page: PDFPage, draw: () => T): T {
    this.pageState(page);
    page.pushOperators(PDFOperator.of(Ops.BeginMarkedContent, [PDFName.of('Artifact')]));
    try {
      return draw();
    } finally {
      page.pushOperators(PDFOperator.of(Ops.EndMarkedContent));
    }
  }

  /**
   * Link a form widget to the current structure element and give it an
   * accessible name. Without /TU a screen reader announces the raw field name
   * ("feld_3") instead of the label the sighted user sees.
   *
   * `fieldDict` matters: PDF/UA (7.18.1) wants /TU on the FIELD, and for a radio
   * group the field and its option widgets are different dictionaries — setting
   * it on the widget alone leaves the group unnamed.
   */
  attachWidget(page: PDFPage, annotRef: PDFRef, accessibleName: string, fieldDict?: PDFDict): void {
    const node = this.current;
    node.kids.push({ kind: 'obj', page, ref: annotRef });
    if (!node.page) node.page = page;
    this.pageState(page);

    const key = this.nextKey++;
    this.annotEntries.push({ key, ref: node.ref });

    const annot = this.doc.context.lookup(annotRef, PDFDict);
    if (annot && accessibleName) {
      annot.set(PDFName.of('StructParent'), PDFNumber.of(key));
      annot.set(PDFName.of('TU'), PDFHexString.fromText(accessibleName));
      if (fieldDict) fieldDict.set(PDFName.of('TU'), PDFHexString.fromText(accessibleName));
    } else {
      if (annot) annot.set(PDFName.of('StructParent'), PDFNumber.of(key));
      this.fieldsWithoutLabel += 1;
    }
  }

  /**
   * XMP metadata stream carrying the PDF/UA identifier. Assistive tech and
   * validators read the claim from here, not from the Info dictionary — without
   * it a document is technically tagged but does not identify itself as
   * conforming (veraPDF clause 7.1, test 8).
   *
   * Deliberately `context.stream` and not `flateStream`: the metadata stream
   * must stay readable without decompression.
   */
  private writeXmpMetadata(): void {
    const esc = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // \uFEFF: the XMP spec requires a BOM here; written as an escape so it does
    // not sit in the source as an invisible character.
    const xmp = `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:pdfuaid="http://www.aiim.org/pdfua/ns/id/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(this.opts.title)}</rdf:li></rdf:Alt></dc:title>
      <dc:language><rdf:Bag><rdf:li>${esc(this.opts.language)}</rdf:li></rdf:Bag></dc:language>
      <xmp:CreatorTool>Grünerator</xmp:CreatorTool>
      <pdfuaid:part>1</pdfuaid:part>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

    // Buffer, not string: pdf-lib encodes a string one charCode per byte
    // (latin1), which mangles umlauts and turns a surrogate pair into stray
    // bytes — an emoji in the title then breaks the XML and voids PDF/UA.
    // A Uint8Array is passed through unchanged, so encode UTF-8 ourselves.
    const stream = this.doc.context.stream(Buffer.from(xmp, 'utf8'), {
      Type: PDFName.of('Metadata'),
      Subtype: PDFName.of('XML'),
    });
    this.doc.catalog.set(PDFName.of('Metadata'), this.doc.context.register(stream));
  }

  /** Write the structure tree, parent tree and document metadata. Call once. */
  finalize(): TaggingChecks {
    const ctx = this.doc.context;

    for (const node of this.nodes) {
      if (node.page) node.dict.set(PDFName.of('Pg'), node.page.ref);
      const kids = PDFArray.withContext(ctx);
      for (const kid of node.kids) {
        if (kid.kind === 'elem' && kid.ref) {
          kids.push(kid.ref);
        } else if (kid.kind === 'mc' && kid.page) {
          // A bare MCID number is only valid when it sits on the element's /Pg.
          if (kid.page === node.page) {
            kids.push(PDFNumber.of(kid.mcid ?? 0));
          } else {
            const mcr = ctx.obj({}) as PDFDict;
            mcr.set(PDFName.of('Type'), PDFName.of('MCR'));
            mcr.set(PDFName.of('Pg'), kid.page.ref);
            mcr.set(PDFName.of('MCID'), PDFNumber.of(kid.mcid ?? 0));
            kids.push(ctx.register(mcr));
          }
        } else if (kid.kind === 'obj' && kid.ref && kid.page) {
          const objr = ctx.obj({}) as PDFDict;
          objr.set(PDFName.of('Type'), PDFName.of('OBJR'));
          objr.set(PDFName.of('Pg'), kid.page.ref);
          objr.set(PDFName.of('Obj'), kid.ref);
          kids.push(ctx.register(objr));
        }
      }
      node.dict.set(PDFName.of('K'), kids);
      ctx.assign(node.ref, node.dict);
    }

    const entries: Array<{ key: number; value: PDFRef }> = [];
    for (const state of this.pages.values()) {
      const owners = PDFArray.withContext(ctx);
      for (let i = 0; i < state.owners.length; i++) {
        owners.push(state.owners[i] ?? this.root.ref);
      }
      entries.push({ key: state.key, value: ctx.register(owners) });
    }
    for (const entry of this.annotEntries) entries.push({ key: entry.key, value: entry.ref });
    entries.sort((a, b) => a.key - b.key);

    const nums = PDFArray.withContext(ctx);
    for (const entry of entries) {
      nums.push(PDFNumber.of(entry.key));
      nums.push(entry.value);
    }
    const parentTree = ctx.obj({}) as PDFDict;
    parentTree.set(PDFName.of('Nums'), nums);

    const structRoot = ctx.obj({}) as PDFDict;
    structRoot.set(PDFName.of('Type'), PDFName.of('StructTreeRoot'));
    const rootKids = PDFArray.withContext(ctx);
    rootKids.push(this.root.ref);
    structRoot.set(PDFName.of('K'), rootKids);
    structRoot.set(PDFName.of('ParentTree'), ctx.register(parentTree));
    structRoot.set(PDFName.of('ParentTreeNextKey'), PDFNumber.of(this.nextKey));
    ctx.assign(this.structRootRef, structRoot);

    const catalog = this.doc.catalog;
    catalog.set(PDFName.of('StructTreeRoot'), this.structRootRef);
    const markInfo = ctx.obj({}) as PDFDict;
    markInfo.set(PDFName.of('Marked'), ctx.obj(true));
    catalog.set(PDFName.of('MarkInfo'), markInfo);
    // showInWindowTitleBar sets /ViewerPreferences /DisplayDocTitle — without it
    // readers announce the file name instead of the document title.
    this.doc.setTitle(this.opts.title, { showInWindowTitleBar: true });
    this.doc.setLanguage(this.opts.language);
    this.writeXmpMetadata();

    return {
      taggedContent: this.markedAnyContent,
      structureTree: this.nodes.length > 1,
      documentLanguage: Boolean(this.opts.language),
      documentTitle: Boolean(this.opts.title.trim()),
      labelledFields: this.fieldsWithoutLabel === 0,
    };
  }
}
