## Cardano MDBook

This repository provides a Contract-as-a-service-contract for Markdown document repositories

Each Markdown Repository has a separate scope of authority and uses uses smart contracts, created with Stellar Contracts and Helios, as a storage location for the markdown documents.

Currently running on Preprod testnet.

Please use `pnpm`, not `npm`.  

### TODO

  - ✅ when not a collaborator, connecting the wallet should guide people to request a 
    collaborator invite from the book's editor(s)
  - ✅ enable collaborator-token minting with address
  - ✅ create book entries, with ownerAuthority for each book entry using collaborator token
  - ✅ enable direct editing by page-owner
  - ✅ allow editor to promote a suggested-page to a page
  - ✅ enable direct editing by editor
  - ✅ non-owner can't update
  - ✅ enable change-suggestion by non-owner; post 'sug' entry
  - ✅ Capture editing steps for suggestions
  - ✅ Enable markdown editor for page-creation
  - ✅ List pending suggestions on page-view, with change markers
  - Allow a suggestion to be accepted, when user is editor or page-owner

#### Future work
  - When a suggestion is obsolete, fetch its parent-txn and rebase the suggestion for presentation
  - Gather topic index and include in site menu
  - Work on unit testing scenarios for editor's DiffCapture extension, so the resulting editing steps can be relied on.  See a laundry list of simple cases that should resolve most odd behaviors seen while experimenting with the prototype
  - Capture editing steps for direct edits


#### future:
  - display each page's change-history using on-chain records
  - cache page data in browser using Dexie
  - do occasional background fetches to keep cache fresh and promptly show 
    changes that may arrive from other users
  - complete the TSDoc for all of the book's StellarContract function-points 
    (until then: Use the Source, Luke)
 - generate dAPI docs from TSDoc
 -  include the Stellar CaaSC protocol to support the SaaS pattern, enabling new 
 projects to be created at the touch of a button.

## Making your own Cardano MDBook

To make your own on-chain MDBook:

  1.  fork this repo in Github.  We request that you kindly (a) rename your MDBook repo 
    and (b) remove or replace this README. :pray:
  2.  ensure `pnpm` is installed, and that you have NodeJS version 18 (we like `nvm` 
  to help with that).
  3.  run `pnpm install` to ensure all deps are ready  
  4.  run `pnpm dev` on the console, and connect your local browser to the URL shown 
    there (powered by Next.js).  You should see a site that looks the same as the Cardano
    MDBook website, including its book contents.  
  4a.  Customize if desired: we suggest editing `Hero.jsx`, `Icon.tsx` and `index.md` 
  (or,  more generally, find !!!customize to find spots good for configuring further).
  5.  edit the file `src/pages/book/[...args].tsx`, using the "null" config at the top 
  of the file, as guided in the comments there.
  6. Reload the browser if needed, and follow the prompts to create a new MDBook 
  contract.  Make sure you have a Cardano wallet on preprod network.
  7. The creation process should offer you a transaction to be signed, chartering a brand 
  new Book contract for you and our org.
  8.  Once your book is chartered, the dApp should show you a chunk of JSON data 
  with guidance to "... deploy the following ...".  Its shape should be similar to the 
  version you're replacing.
  9.  Feel free to create initial MDBook content using your local Next.js environment; 
  the pages created will be stored on-chain, connected with the details from the prior 
  step.
  10.  Commit all changes in git, and push to your forked repository (whose name 
  SHOULD NOT be the same as our repo name :pray:) to Github or another repository 
  storage provider.
  11.  Check Github Actions, which may require some small configuration at Github, 
  but should otherwise deploy to Github Pages without difficulty.
  
  If you're not using Github, you can use `next build` and push the resulting static files 
  to any static hosting provider.

## Developing

If you're developing the cardano-mdbook infrastructure project (NOT creating your own MDBook), 
see `next.config.mjs` to learn how to set an environment variable to prevent startup errors with `BASE_PATH="/cardano-mdbook"``

To get started with this template, first install the npm dependencies:

```bash
pnpm install
cp .env.example .env.local
```

Next, run the development server:

```bash
pnpm dev
```

Finally, open [http://localhost:3000](http://localhost:3000) in your browser to view the website.

## Customizing

You can start editing this template by modifying the files in the `/src` folder. The site will auto-update as you edit these files.

## Global search

By default this template uses [Algolia DocSearch](https://docsearch.algolia.com) for the global search. DocSearch is free for open-source projects, and you can sign up for an account on their website. Once your DocSearch account is ready, update the following [environment variables](https://nextjs.org/docs/basic-features/environment-variables) in your project with the values provided by Algolia:

```
NEXT_PUBLIC_DOCSEARCH_APP_ID=
NEXT_PUBLIC_DOCSEARCH_API_KEY=
NEXT_PUBLIC_DOCSEARCH_INDEX_NAME=
```

## Learn more

To learn more about the technologies used in this site template, see the following resources:

- [Tailwind CSS](https://tailwindcss.com/docs) - the official Tailwind CSS documentation
- [Next.js](https://nextjs.org/docs) - the official Next.js documentation
- [Headless UI](https://headlessui.dev) - the official Headless UI documentation
- [Markdoc](https://markdoc.io) - the official Markdoc documentation
- [DocSearch](https://docsearch.algolia.com) - the official DocSearch documentation
