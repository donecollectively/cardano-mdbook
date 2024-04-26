# About Stellar Contracts

Thanks for asking! Cardano MDBook is created using Stellar Contracts, a rich typescript library for effectively managing complexity for data-rich dApps.

## Built together with Helios

Thanks for Christian Schmitz, and thanks for Helios! Helios' Javascript-based off-chain bridge interfaces with on-chain scripts written in the Helios language, whose syntax design is heavily inspired by Golang, but which is purpose-built for the Plutus execution environment.

Helios can run entirely in the browser, enabling smart-contracts and dApps that can be created and executed without need for any other tooling. No WASM, no long builds, no Nix. That's amazing. We're using it everywhere, without any need for other Cardano libraries.

## Enabled by UPLC (Plutus)

Naturally we're very grateful for the pioneering work done in Haskell, which continues to drive the on-chain execution of Cardano smart contracts. Its extremely simple execution model and pure functional environment are a welcome shift from other web3 environments.

## Built for Rich dApps

We've optimized the developer experience in Stellar Contracts to support data-rich applications. Whether they're created for mainnet or for side-chains, Cardano's powerful consensus and smart-contract environment are ideal for high-assurance applications.

## Structured Families of Contracts

Until now, it's been a lot easier to build monolithic contracts than to use multi-contract patterns. But it can be easy to accumulate too much complexity (and, too much code for mainnet transactions) that way.

Stellar Contracts is paving the way to complexity management, with linked groups of granular contracts - each having specific responsibilities for serving different aspects of large dApps.

Each contract's leader maintains its address over time, and it allows other contracts to be plugged in, delegating policy-enforcement tasks to narrowly-scoped contract scripts whose behavior is easier to validate.

### Key Pattern: Delegation

One of Stellar's key patterns is that of delegation, where a thread token (we call them Unique Utility Tokens or UUTs) is delegated to a partner script, and its token-id is stored in the main script.

Why? It's partly about separating concerns - but it's also about evolution.

## Smart Contract Evolution

Evolution?? "Smart Contracts are Immutable!", I hear you cry. It's true - but Stellar Contracts, through its delegation pattern, is set up for more typical patterns in practical software development

*   First, make a small version of something
    
*   Then, make it good enough for now.
    
*   Ship it, and celebrate! 🎉
    
*   Then, start iterating. Lather, rinse and repeat.
    

Stellar contract delegates are designed specifically to support that kind of software development lifecycle. Registering a new delegate script enables a smart contract's main address to remain stable, while ensuring enforcement of evolving policies through evolving delegate scripts.

## Built with Typescript

Stellar's transaction-builder uses typescript to provide type safety and auto-complete for off-chain transaction-building. We're pushing the limits of the kinds of type information that can be included in transactions-in-progress, including named UUTs, transaction-state variables, and named delegates, to make transaction-building fun and (type) safe.

## More to do...

Stay tuned for news about more libraries supporting rich dApps, high-assurance business processes, tokenomics mechanisms, and database-like functionality for self-sovereign dApps.

And, for updated versions of the Stellar Contracts API's.

## Support Stellar Contracts and Helios

Please make sure to vote for funding projects like this, so we can accelerate the creation of high-functioning, mass-audience projects on Cardano.

Thank you!
