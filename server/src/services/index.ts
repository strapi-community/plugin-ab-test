import experiments from './experiments';
import registry from './registry';
import settings from './settings';
import uninstall from './uninstall';
import variants from './variants';

const services = {
  experiments,
  registry,
  settings,
  uninstall,
  variants,
};

export type Services = typeof services;

export default services;
