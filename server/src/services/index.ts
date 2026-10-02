import experiments from './experiments';
import metrics from './metrics';
import posthog from './posthog';
import registry from './registry';
import results from './results';
import settings from './settings';
import uninstall from './uninstall';
import variants from './variants';

const services = {
  experiments,
  metrics,
  posthog,
  registry,
  results,
  settings,
  uninstall,
  variants,
};

export type Services = typeof services;

export default services;
