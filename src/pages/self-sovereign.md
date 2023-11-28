---
title: This dApp is self-sovereign
pageTitle: Self-Sovereign dApp
---

No centralized server required

---

## How is this dApp self-sovereign?

### What is self-sovereignty?

A dApp that's self-sovereign doesn't rely on any  privately-operated server infrastructure.

### More details

The smart contracts that run this site are entirely embedded within the site's code.  Thanks to Helios, no separate build environment is needed.

The site is statically generated, so it can be easily hosted, usually for free, on Github or other static site-hosting services.

You can fork the codebase and run your own.  Check the README for step-by-step guidance.

There are no centralized api services or backend databases required.  Everything you see in the application is either part of the git repo, or is stored on a Cardano-based chain (pre-production, for now).

### How you can help

This version depends on Blockfrost - so it's technically only "almost" self-sovereign.  Still, the above points of sovereignty feel pretty nice!

TODO: add support for Koios, and for multiple Koios providers, to supplement Blockfrost and ensure redundancy.  Helios' [Network interface](https://www.hyperion-bt.org/helios-book/api/reference/interfaces/Network.html), and its adapters, should make this a small adjustment.

