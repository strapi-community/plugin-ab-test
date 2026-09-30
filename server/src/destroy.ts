let unsubscribe: (() => void) | undefined;

export const setUnsubscribe = (fn: unknown) => {
  unsubscribe = typeof fn === 'function' ? (fn as () => void) : undefined;
};

const destroy = () => {
  unsubscribe?.();
  unsubscribe = undefined;
};

export default destroy;
