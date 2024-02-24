---
title: cMDBook Guide
pageTitle: Guide
description: Setting up Cardano MDBook
---

Getting started with cMDBook

---

## Overview

After setting up the repository for local development, you'll need to set up a project name and make appropriate modifications to the site template.  

To deploy your test contract to the preproduction network:
  * Approve the book-charter transactions
  * Invite yourself as a collaborator
  * Create your first page
  * Push your static site to a page-hosting service

Then you can experiment with page-creation and editing, invite more collaborators, and make sure you're understanding the flow of work in a cost-free environment.

Once you're satisfied, deploy your mainnet book contract for permanent public storage and start collaborating with your team.

### Repo Setup

We suggest forking our repository to run your own MDBook (if you're contributing improvements to the software, do skip that step, and see more info below).  Once you've forked the repo...

Check out the repository from git.  You'll need NodeJS 18 or better.  Use `pnpm` to install dependencies. 

#### Setting the Project Name and starting the dev server

You must change the BASE_PATH setting in `.env.development` and `.env.production`.  Choose a URL path prefix that suits your project purpose.

You'll need to **include your own Blockfrost API keys** in your deployment with `NEXT_PUBLIC_bf_preprod` and/or `NEXT_PUBLIC_bf_mainnet` settings.  

Once this is done, running `pnpm start` will start the development server.  Click the provided URL to open your browser pointing to the local dev server.

### Tech Stuff

#### CIP-30 Wallet Compatibility

The dApp can work fine with any CIP-30 wallet, but we've focused on testing with Eternl.  So, you might need to use the Eternl wallet too.  Use their browser plugin (not their web wallet).  

Got another favorite CIP-30 wallet?  Please feel free to submit an update that works with Eternl and additional wallets, or work together with us to make it happen.

#### Transaction and Document-size limitations

On Cardano mainnet, you'll be constrained by transaction-size limits, and be able to create moderate-sized pages.  Using a Cardano side-chain, you can override the parameters and expand your capacity.  Still, the current 16kB transaction size allows for a decent amount of content (~2000 words per page).  

Change suggestions use more space (can be 3-4x or more) than the actual size of the changes, in order that we can merge those changes into different versions of the page.  Beware creating major changes; focused surgical changes on separate themes should work fine, though.  

#### Deploying the contract in the Preprod environment

Click the **Index** in the main menu.  The `src/book/[...args].tsx` file controls this page, and it should automatically detect that your project hasn't yet been created.  Click the **Create Contract** button onscreen, and a new CMDBook contract-creation transaction will be sent to your wallet for approval.  Make sure your wallet is connected to the same network (preprod) reflected in the CMDBook UI.  Approve the transaction in your CIP-30 wallet.

After the initial contract-creation transaction, a second transaction is also submitted to your wallet, for registering an on-chain reference script.  Approve the second transaction, and wait a short while for the transaction to be confirmed.

In the development environment, the new contract details are saved in your browser.  See **Deploying to Production** for mainnet deployment.

Once your book's charter is confirmed onchain, reload the **Index** page to see the book's (empty) list of pages.  Continue by inviting yourself to be a book collaborator.

#### Deploying your dApp

You can experiment solo using your development environment on localhost, either in preprod or mainnet.  To experiment with collaborators, you'll need to deploy your site to a hosting service.  If you deploy that same smart-contract configuration to a publicly-visible server, the server should show the same book contents.

We have used the Github Pages workflow with great success, using the recipes in the `.github/workflows/` folder.  You'll probably need to do some light configuration in your GIthub repo.  

 Vercel or other static hosting services should work great too.

#### How it works

CMDBook creates a smart contract, in which each separate page of your book is stored.  Each one uses a different UTxO, with a Datum structure designed specifically for storing various details about that page in the book.  This UTxO contains a "thread token" or "Unique Utility Token" (UUT), whose name looks like `eid-‹random chars›`.

Change-suggestions are also stored as separate UTxOs, with their own `eid-‹random›` record-ids.

The CMDBook dApp queries a chain indexer for all the pages found in your book contract, and the details of those pages are then presented onscreen.

Updates to a book page are done by spending the previous version of the page, replacing it with a new version in a new UTxO.  The `eid-‹random›` UUT/record-id stays with the new version of the page.

When accepting changes, the Suggestion record is spent, and the Page record is updated with the changes.  The Suggestion's UUT is burned.  A rejected change is simply burned, without updating the Page record.

These various activities provide the basis for the standard "Create/Read/Update/Delete" patterns of data management.  The smart contract implements key policies; for instance, checking that your updates include a reasonable timestamp for `updatedAt`, and that the `updatedBy` field includes your`collab-‹random›` id.

## CMDBook Roles and activities

### Editor Authority

As the creator of the book, you received a token (similar to an NFT) in your wallet, whose name looks like `capoGov-‹random chars›`.  Hang onto this token, as it represents your authority to invite others to collaborate, and to maintain pages.  Decentralizing this authority is an area of future development.

When you have Editor authority (AND a Collaborator token), you can create pages directly.  Otherwise, you'll be able (as a Collaborator) to create Suggested pages, which the Editor can upgrade to a full Page.  You'll be the owner of the page you suggested (see more below).

The editor can also apply changes directly to any page, or accept Suggestions.

### Inviting Collaborators

The editor has the authority to invite collaborators.  In fact, during first time setup of your book, you'll probably want to invite yourself to be a collaborator (you can't create pages until you do!).  Paste your wallet address into the **Invite Collaborators** page to mint a collaborator token.  Of course, you'll need to approve the transaction in your CIP-30 wallet.

Paste additional addresses to add more collaborators, and sign each transaction.  The collaborator token names will look like `collab-‹random chars›`.  Transactions may take a little while to be confirmed.

When you have the **Editor** or **Collaborator** tokens, the dApp will recognize these roles, and reflect them with badges in the upper-right corner of the page.  You'll see controls offering additional functionality matching your authority, as well.

### Page Owner

The creator of a page is the Owner of that page, with authority to apply changes directly to the page content.  

Page owners can review and accept or reject Suggestions (see more below).

## Day to Day Book Maintainance

### Creating Pages

Once you're recognized as a Collaborator, a `Create Page` button will be offered on the book index screen.  Click it to start creating your first CMDBook.

### Editing Pages

If you're the Editor or a page Owner, you can edit pages onscreen and save the changes directly.  Or you can choose to save your changes as a Suggestion.  Regular collaborators only have the option to save Suggestions.  Non-collaborators won't have access to an Edit button.

#### Having Trouble?

If the dApp isn't recognizing you as a Collaborator, your CIP-30 wallet might not be connected to the right account.  Make sure you're using the account having the expected `collab-...` token (and `capoGov-...`, for the Editor role).

These tokens are always returned to your wallet when they're used as authority for a book update activity.

### Suggesting Changes

Once you have a Collaborator token, you'll have the option to modify a page.  

When you submit a suggestion, the original on-chain page record isn't modified; instead a Suggestion record is created, and is displayed as a provisional part of the page when it's shown onscreen.

### Reviewing Changes

If you have page-owner or Editor authority, you'll be able to Accept or Reject suggestions.  Otherwise, you'll only be able to view the page with (or without) suggested changes. 

## Customizing 

The repo is a NextJS project that uses Markdoc, so most of your in-site content management can use Markdown.  Find this file in `src/pages/cmdbook-guide.md` to see how to create static content in this way.  And see `src/index.js` to make adjustments to the application menu.  Later, you can use the on-chain content management to add pages to the menu and maintain them together with your collaborators

Please feel free to adjust the NextJS site template in `components/Layout.jsx` and `pages/_app.jsx` and `pages/_document.jsx` as needed.  

## Contributing to cMDBook

Please use good contribution practices: maintain the style of code as you make changes, keep things clean, and submit the smallest surgical changes.  Thanks!

When you run the development server, use `CMDBook=1 pnpm dev` to signal the dev server that you're working on the CMDBook project, not your own book based on the project.

## Some Links

{% quick-links %}

{% quick-link title="Link 1" icon="lightbulb" href="/page1" description="description of the content" /%}

{% quick-link title="Link 2" icon="installation" href="/page2" description="another description" /%}

{% quick-link title="Link3" icon="presets" href="/page3" description="add as many links as you like" /%}

{% /quick-links %}