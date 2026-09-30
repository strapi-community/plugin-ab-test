import { AsyncLocalStorage } from 'node:async_hooks';

const internalCall = new AsyncLocalStorage<true>();

/**
 * Runs the plugin's own document calls without the A/B middleware acting on them, so fetching
 * or deleting a variant is not filtered out by the rule that hides variants.
 */
export const runInternal = <T>(fn: () => Promise<T>): Promise<T> => internalCall.run(true, fn);

export const isInternalCall = (): boolean => internalCall.getStore() === true;
